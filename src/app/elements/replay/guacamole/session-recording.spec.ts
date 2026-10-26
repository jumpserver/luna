import Guacamole from '@guacamole';
import {createRecordingSource} from './recording-source';

function instruction(...elements: Array<string | number>) {
  return elements.map(element => {
    const value = String(element);
    return Array.from(value).length + '.' + value;
  }).join(',') + ';';
}

function frame(timestamp: number, red: number, green = 0, blue = 0, mask = 12) {
  return instruction('rect', 0, 0, 0, 2, 2)
    + instruction('cfill', mask, 0, red, green, blue, 255)
    + instruction('sync', timestamp);
}

const HEADER = instruction('size', 0, 2, 2) + instruction('name', '中😀');

function seek(recording: Guacamole.SessionRecording, position: number) {
  return new Promise<void>(resolve => recording.seek(position, resolve));
}

function pixel(recording: Guacamole.SessionRecording) {
  const display = recording.getDisplay() as any;
  return Array.from(display.getDefaultLayer().getCanvas().getContext('2d').getImageData(0, 0, 1, 1).data);
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for recording operation');
}

describe('Guacamole bounded session recording', () => {
  const recordings: Guacamole.SessionRecording[] = [];

  function createSource(text: string, chunkSize = 65536) {
    const bytes = new TextEncoder().encode(text);
    const blob = new Blob([bytes]);
    return {
      async *stream(signal?: AbortSignal) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          if (signal && signal.aborted) {
            return;
          }
          yield bytes.subarray(offset, offset + chunkSize);
        }
      },
      read: jasmine.createSpy('read').and.callFake(async (start, end) => blob.slice(start, end)),
      close: jasmine.createSpy('close')
    };
  }

  async function load(source: Guacamole.SessionRecording.Source) {
    const recording = new Guacamole.SessionRecording(source);
    recordings.push(recording);
    await new Promise<void>((resolve, reject) => {
      recording.onload = resolve;
      recording.onerror = reject;
    });
    return recording;
  }

  function captureFrames() {
    const frames: any[] = [];
    const Recording = Guacamole.SessionRecording as any;
    const Original = Recording._Frame;
    spyOn(Recording, '_Frame').and.callFake((...args) => {
      const result = new Original(...args);
      frames.push(result);
      return result;
    });
    return frames;
  }

  afterEach(() => recordings.splice(0).forEach(recording => recording.dispose()));

  it('indexes Unicode without frame payloads and reads bytes only when seeking', async () => {
    const frames = captureFrames();
    const source = createSource(HEADER + frame(0, 255) + frame(1000, 0, 255), 1);
    const recording = await load(source);
    expect(source.read).not.toHaveBeenCalled();
    expect(frames.every(item => item.blob === null && item.instructions === undefined)).toBe(true);
    await seek(recording, 1000);
    expect(pixel(recording)).toEqual([0, 255, 0, 255]);
    expect(source.read.calls.count()).toBe(2);
    await seek(recording, 0);
    expect(pixel(recording)).toEqual([255, 0, 0, 255]);
    (recording as any).setPlaybackRate(100);
    recording.play();
    await until(() => !recording.isPlaying());
    expect(pixel(recording)).toEqual([0, 255, 0, 255]);
  });

  it('replays a multi-block browser download through IndexedDB in both directions', async () => {
    const frames = captureFrames();
    const padding = instruction('name', 'a'.repeat(3 * 1024 * 1024) + '中😀');
    const text = HEADER + padding + frame(0, 255) + frame(1000, 0, 255);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(new TextEncoder().encode(text))));
    const recording = await load(createRecordingSource('/recording'));
    expect(frames.every(item => item.blob === null && item.instructions === undefined)).toBe(true);
    await seek(recording, 1000);
    expect(pixel(recording)).toEqual([0, 255, 0, 255]);
    await seek(recording, 0);
    expect(pixel(recording)).toEqual([255, 0, 0, 255]);
  });

  it('snapshots only the anchor and destination on a long seek and retains at most 32 other states', async () => {
    const frames = captureFrames();
    const padding = instruction('name', 'x'.repeat(20000));
    const text = HEADER + Array.from({length: 40}, (_, index) => padding + frame(index * 5000, index)).join('');
    const recording = await load(createSource(text));
    await seek(recording, 39 * 5000);
    expect(frames.filter(item => item.clientState).length).toBe(2);
    for (let index = 0; index < 40; index++) {
      await seek(recording, index * 5000);
    }
    expect(frames.filter(item => item.clientState).length).toBe(33);
    expect(frames[0].clientState instanceof Blob).toBe(true);
    // Seeking to an evicted frame reconstructs its pixels from the retained anchor.
    await seek(recording, 5000);
    expect(pixel(recording)).toEqual([1, 0, 0, 255]);
  });

  it('bounds optional snapshot bytes independently of the anchor', async () => {
    const frames = captureFrames();
    const Runtime = Guacamole as any;
    const Client = Runtime.Client;
    const padding = 'x'.repeat(10 * 1024 * 1024);
    spyOn(Runtime, 'Client').and.callFake(tunnel => {
      const client = new Client(tunnel);
      const original = client.exportState;
      client.exportState = callback => original(state => {
        state.padding = padding;
        callback(state);
      });
      return client;
    });
    const recording = await load(createSource(HEADER + Array.from({length: 6}, (_, index) => frame(index * 1000, index)).join('')));
    for (let index = 0; index < 6; index++) {
      await seek(recording, index * 1000);
    }
    const optional = frames.slice(1).filter(item => item.clientState);
    expect(optional.length).toBe(3);
    expect(optional.reduce((total, item) => total + item.clientState.size, 0)).toBeLessThan(32 * 1024 * 1024);
    expect(frames[0].clientState).not.toBe(null);
    await seek(recording, 0);
    expect(pixel(recording)).toEqual([0, 0, 0, 255]);
  });

  it('does not apply an additive frame twice when a seek replaces a pending source read', async () => {
    const source = createSource(HEADER + frame(0, 10, 0, 0, 15) + frame(1000, 20, 0, 0, 15));
    let release: () => void;
    const actualRead = async (start: number, end: number) => {
      const bytes = new TextEncoder().encode(HEADER + frame(0, 10, 0, 0, 15) + frame(1000, 20, 0, 0, 15));
      return new Blob([bytes]).slice(start, end);
    };
    source.read.and.callFake(async (start, end) => {
      if (!release) {
        await new Promise<void>(resolve => release = resolve);
      }
      return actualRead(start, end);
    });
    const recording = await load(source);
    recording.seek(1000);
    await until(() => !!release);
    const latest = seek(recording, 1000);
    release();
    await latest;
    expect(pixel(recording)).toEqual([30, 0, 0, 255]);
  });

  it('closes the source once and suppresses late reads after disposal', async () => {
    const source = createSource(HEADER + frame(0, 255));
    const recording = await load(source);
    let release: () => void;
    source.read.and.callFake(async () => {
      await new Promise<void>(resolve => release = resolve);
      return new Blob([HEADER + frame(0, 255)]);
    });
    const positioned = jasmine.createSpy('positioned');
    recording.onseek = positioned;
    recording.seek(0);
    await until(() => !!release);
    recording.dispose();
    recording.dispose();
    release();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(source.close.calls.count()).toBe(1);
    expect(positioned).not.toHaveBeenCalled();
  });

  it('reports failed source reads and disposes partial storage', async () => {
    const source = createSource(HEADER + frame(0, 255));
    const recording = await load(source);
    source.read.and.callFake(() => Promise.reject(new Error('Recording cache is unavailable')));
    const error = await new Promise<string>(resolve => {
      recording.onerror = resolve;
      recording.seek(0);
    });
    expect(error).toBe('Recording cache is unavailable');
    expect(source.close.calls.count()).toBe(1);
    expect(recording.isPlaying()).toBe(false);
  });
});
