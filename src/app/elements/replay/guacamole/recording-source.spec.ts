import {createRecordingSource} from './recording-source';
import Guacamole from '@guacamole';

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function rejected(promise: Promise<any>): Promise<Error> {
  try {
    await promise;
    throw new Error('Expected operation to fail');
  } catch (error) {
    expect(error.message).not.toBe('Expected operation to fail');
    return error;
  }
}

describe('Guacamole browser recording storage', () => {
  const sources: Guacamole.SessionRecording.Source[] = [];

  function source() {
    const recording = createRecordingSource('/recording');
    sources.push(recording);
    return recording;
  }

  async function drain(recording: Guacamole.SessionRecording.Source) {
    let length = 0;
    for await (const chunk of recording.stream()) {
      length += chunk.byteLength;
    }
    return length;
  }

  afterEach(() => sources.splice(0).forEach(recording => recording.close()));

  [0, 1, 2].forEach(layers => {
    it('streams ' + layers + ' gzip layers with a signature split across chunks', async () => {
      const text = '4.name,2.中😀;4.sync,1.0;';
      let bytes = new TextEncoder().encode(text);
      for (let i = 0; i < layers; i++) {
        const compressed = new Response(bytes).body.pipeThrough<Uint8Array>(new (window as any).CompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(compressed).arrayBuffer());
      }
      let offset = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === bytes.length) {
            controller.close();
          } else {
            controller.enqueue(bytes.slice(offset, ++offset));
          }
        }
      });
      spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(body)));
      const open = spyOn(indexedDB, 'open').and.callThrough();
      const recording = source();
      const length = await drain(recording);
      expect(length).toBe(new TextEncoder().encode(text).byteLength);
      expect(await blobText(await recording.read(0, length))).toBe(text);
      const name = open.calls.mostRecent().args[0];
      recording.close();
      if (typeof (indexedDB as any).databases === 'function') {
        // Wait for the queued database deletion rather than assuming it is synchronous.
        for (let attempt = 0; attempt < 50; attempt++) {
          const entries = await (indexedDB as any).databases();
          if (!entries.some(entry => entry.name === name)) {
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        fail('Temporary recording database was not deleted');
      }
    });
  });

  it('commits blocks before publishing ranges and bounds the read cache to eight blocks', async () => {
    const blockSize = 2 * 1024 * 1024;
    const bytes = new Uint8Array(blockSize * 9);
    bytes.fill(65);
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(bytes)));
    const get = spyOn(IDBObjectStore.prototype, 'get').and.callThrough();
    const recording = source();
    const iterator = recording.stream()[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value.byteLength).toBe(blockSize);
    expect(await blobText(await recording.read(0, 1))).toBe('A');
    while (!(await iterator.next()).done) {}
    for (let index = 1; index < 9; index++) {
      expect(await blobText(await recording.read(index * blockSize, index * blockSize + 1))).toBe('A');
    }
    expect(get.calls.count()).toBe(9);
    await recording.read(0, 1);
    expect(get.calls.count()).toBe(10);
    expect((await rejected(recording.read(bytes.length, bytes.length + 1))).message).toContain('range');
  });

  it('cancels stalled scanning while preserving committed reads until disposal', async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024);
    bytes.fill(65);
    const cancelled = jasmine.createSpy('cancelled');
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); },
      cancel: cancelled
    });
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(body)));
    const recording = source();
    const scanController = new AbortController();
    const iterator = recording.stream(scanController.signal)[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    scanController.abort();
    expect((await rejected(pending)).name).toBe('AbortError');
    expect(cancelled).toHaveBeenCalled();
    expect(await blobText(await recording.read(0, 1))).toBe('A');
    recording.close();
    expect((await rejected(recording.read(0, 1))).name).toBe('AbortError');
  });

  it('reports quota failure without falling back to memory storage', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('recording')));
    spyOn(IDBObjectStore.prototype, 'put').and.callFake(() => {
      throw new DOMException('Storage quota exhausted', 'QuotaExceededError');
    });
    const recording = source();
    const error = await rejected(drain(recording));
    expect(error.name).toBe('QuotaExceededError');
    expect((await rejected(recording.read(0, 1))).message).toContain('range');
  });

  it('reports disabled storage and tolerates denied cleanup', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('recording')));
    spyOn(indexedDB, 'open').and.callFake(() => {
      throw new DOMException('Browser storage is disabled', 'SecurityError');
    });
    spyOn(indexedDB, 'deleteDatabase').and.callFake(() => {
      throw new DOMException('Browser storage is disabled', 'SecurityError');
    });
    const recording = source();
    expect((await rejected(drain(recording))).name).toBe('SecurityError');
    expect(() => recording.close()).not.toThrow();
    expect(() => recording.close()).not.toThrow();
  });

  it('rejects unsuccessful HTTP responses', async () => {
    spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('', {status: 403})));
    expect((await rejected(drain(source()))).message).toContain('HTTP 403');
  });
});
