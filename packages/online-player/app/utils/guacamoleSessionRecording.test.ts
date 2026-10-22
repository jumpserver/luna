import Guacamole from "@jumpserver/guacamole";
import { afterEach, describe, expect, it, vi } from "vitest";

function instruction(...elements: Array<string | number>) {
  const encoded = elements
    .map((element) => {
      const value = String(element);
      return `${Array.from(value).length}.${value}`;
    })
    .join(",");
  return `${encoded};`;
}

function frame(timestamp: number, red: number, green: number, blue: number, mask = 12) {
  return (
    instruction("rect", 0, 0, 0, 2, 2) +
    instruction("cfill", mask, 0, red, green, blue, 255) +
    instruction("sync", timestamp)
  );
}

const HEADER = instruction("size", 0, 2, 2) + instruction("name", "中😀");
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];

type Recording = InstanceType<typeof Guacamole.SessionRecording>;

function pixel(recording: Recording) {
  const canvas = recording.getDisplay().getDefaultLayer().getCanvas();
  return Array.from(canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data);
}

function seek(recording: Recording, position: number) {
  return new Promise<void>((resolve) => recording.seek(position, resolve));
}

// Rendering and Blob/FileReader playback must be exercised in a real browser.
describe.skipIf(typeof document === "undefined")("Guacamole.SessionRecording", () => {
  const recordings: Recording[] = [];

  function createRecording(
    source: InstanceType<typeof Guacamole.StaticHTTPTunnel> | Blob | Guacamole.SessionRecording.Source
  ) {
    const recording = new Guacamole.SessionRecording(source);
    recordings.push(recording);
    return recording;
  }

  afterEach(() => {
    for (const recording of recordings.splice(0)) {
      recording.dispose();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createSource(dump: string, chunkSize = 17) {
    const bytes = new TextEncoder().encode(dump);
    const blob = new Blob([bytes]);
    return {
      async *stream(signal?: AbortSignal) {
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          if (signal?.aborted) return;
          yield bytes.subarray(offset, offset + chunkSize);
        }
      },
      read: vi.fn(async (start: number, end: number) => blob.slice(start, end)),
      close: vi.fn()
    } satisfies Guacamole.SessionRecording.Source;
  }

  it("indexes asynchronous chunks without retaining frame Blobs and reads ranges only for playback", async () => {
    const source = createSource(HEADER + frame(0, 255, 0, 0) + frame(1000, 0, 255, 0), 1);
    const recording = createRecording(source);
    const onload = vi.fn();
    recording.onload = onload;
    await expect.poll(() => onload.mock.calls.length).toBe(1);
    expect(source.read).not.toHaveBeenCalled();
    expect(recording.getDuration()).toBe(1000);

    await seek(recording, 1000);
    expect(pixel(recording)).toEqual(GREEN);
    expect(source.read).toHaveBeenCalledTimes(2);
    expect(source.read.mock.calls[0]).toEqual([0, new TextEncoder().encode(HEADER + frame(0, 255, 0, 0)).length]);
    await seek(recording, 0);
    expect(pixel(recording)).toEqual(RED);
    recording.setPlaybackRate(100);
    recording.play();
    await expect.poll(() => recording.isPlaying()).toBe(false);
    expect(pixel(recording)).toEqual(GREEN);
  });

  it("replaces a pending source read without applying an additive frame twice", async () => {
    const source = createSource(HEADER + frame(0, 10, 0, 0, 15) + frame(1000, 20, 0, 0, 15));
    const recording = createRecording(source);
    await expect.poll(() => recording.getDuration()).toBe(1000);
    const read = source.read.getMockImplementation()!;
    let release!: () => void;
    source.read.mockImplementationOnce(async (start, end) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return read(start, end);
    });
    recording.seek(1000);
    await expect.poll(() => source.read.mock.calls.length).toBe(1);
    const latest = seek(recording, 1000);
    release();
    await latest;
    expect(pixel(recording)).toEqual([30, 0, 0, 255]);
    expect(recording.isPlaying()).toBe(false);
  });

  it("reports failed source reads and stops playback", async () => {
    const source = createSource(HEADER + frame(0, 255, 0, 0));
    const recording = createRecording(source);
    const onload = vi.fn();
    const onerror = vi.fn();
    recording.onload = onload;
    recording.onerror = onerror;
    await expect.poll(() => onload.mock.calls.length).toBe(1);
    source.read.mockRejectedValueOnce(new Error("Recording cache is unavailable"));
    recording.play();
    await expect.poll(() => onerror.mock.calls.length).toBe(1);
    expect(onerror).toHaveBeenCalledWith("Recording cache is unavailable");
    expect(recording.isPlaying()).toBe(false);
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("aborts scanning while preserving cached reads and closes the source only on disposal", async () => {
    const source = createSource(HEADER + frame(0, 255, 0, 0));
    let scanSignal: AbortSignal | undefined;
    let stopped = false;
    const originalStream = source.stream;
    source.stream = async function* (signal?: AbortSignal) {
      scanSignal = signal;
      yield* originalStream(signal);
      await new Promise<void>((resolve) =>
        signal?.addEventListener(
          "abort",
          () => {
            stopped = true;
            resolve();
          },
          { once: true }
        )
      );
    };
    const recording = createRecording(source);
    const progress = vi.fn();
    const onload = vi.fn();
    recording.onprogress = progress;
    recording.onload = onload;
    await expect.poll(() => progress.mock.calls.length).toBe(1);
    recording.disconnect();
    expect(scanSignal?.aborted).toBe(true);
    expect(stopped).toBe(true);
    expect(source.close).not.toHaveBeenCalled();
    await seek(recording, 0);
    expect(pixel(recording)).toEqual(RED);
    expect(onload).not.toHaveBeenCalled();
    recording.dispose();
    recording.dispose();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("disposes a pending source read without late rendering, callbacks or errors", async () => {
    const source = createSource(HEADER + frame(0, 255, 0, 0));
    const recording = createRecording(source);
    const onload = vi.fn();
    const onerror = vi.fn();
    const onseek = vi.fn();
    recording.onload = onload;
    recording.onerror = onerror;
    recording.onseek = onseek;
    await expect.poll(() => onload.mock.calls.length).toBe(1);
    let reject!: (error: Error) => void;
    source.read.mockImplementationOnce(
      () =>
        new Promise<Blob>((_resolve, rejectRead) => {
          reject = rejectRead;
        })
    );
    recording.seek(0);
    await expect.poll(() => source.read.mock.calls.length).toBe(1);
    recording.dispose();
    reject(new Error("Read cancelled"));
    await Promise.resolve();
    await Promise.resolve();
    expect(source.close).toHaveBeenCalledOnce();
    expect(onerror).not.toHaveBeenCalled();
    expect(onseek).not.toHaveBeenCalled();
    expect(recording.getDuration()).toBe(0);
    expect(recording.getPosition()).toBe(0);
  });

  it("renders a tiny Unicode recording and restores earlier frames when seeking", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    const onload = vi.fn();
    const onerror = vi.fn();
    recording.onload = onload;
    recording.onerror = onerror;

    recording.connect(HEADER + frame(0, 255, 0, 0) + frame(1000, 0, 255, 0));

    expect(onload).toHaveBeenCalledOnce();
    expect(recording.getDuration()).toBe(1000);
    await seek(recording, 0);
    await expect.poll(() => pixel(recording)).toEqual(RED);
    await seek(recording, 1000);
    await expect.poll(() => pixel(recording)).toEqual(GREEN);
    await seek(recording, 0);
    await expect.poll(() => pixel(recording)).toEqual(RED);
    expect(recording.isPlaying()).toBe(false);
    expect(onerror).not.toHaveBeenCalled();
  });

  it("snapshots only the anchor and destination when seeking across many keyframes", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    const padding = instruction("name", "a".repeat(16384));
    recording.connect(
      HEADER + Array.from({ length: 8 }, (_, index) => padding + frame(index * 5000, index, 0, 0)).join("")
    );
    const encodePNG = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");

    await seek(recording, 35000);

    expect(encodePNG).toHaveBeenCalledTimes(2);
    expect(pixel(recording)).toEqual([7, 0, 0, 255]);
    await seek(recording, 5000);
    expect(pixel(recording)).toEqual([1, 0, 0, 255]);
    await seek(recording, 35000);
    expect(pixel(recording)).toEqual([7, 0, 0, 255]);
    expect(encodePNG).toHaveBeenCalledTimes(3);
  });

  it("retains keyframe snapshots during normal playback", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    const padding = instruction("name", "a".repeat(16384));
    recording.connect(
      HEADER + Array.from({ length: 4 }, (_, index) => padding + frame(index * 5000, index, 0, 0)).join("")
    );
    const encodePNG = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");
    recording.setPlaybackRate(100000);
    recording.play();

    await expect.poll(() => recording.getPosition()).toBe(15000);
    expect(encodePNG).toHaveBeenCalledTimes(4);
    expect(pixel(recording)).toEqual([3, 0, 0, 255]);
  });

  it("evicts the least recently used snapshot after 32 entries and preserves backward seeks", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + Array.from({ length: 34 }, (_, index) => frame(index * 1000, index, 0, 0)).join(""));
    for (let index = 0; index <= 32; index++) await seek(recording, index * 1000);

    // Reusing frame 1 makes frame 2 the oldest of the 32 optional snapshots.
    await seek(recording, 1000);
    await seek(recording, 33000);
    const encodePNG = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");

    await seek(recording, 2000);
    expect(encodePNG).toHaveBeenCalledOnce();
    expect(pixel(recording)).toEqual([2, 0, 0, 255]);
    await seek(recording, 0);
    expect(pixel(recording)).toEqual([0, 0, 0, 255]);
    await seek(recording, 33000);
    expect(pixel(recording)).toEqual([33, 0, 0, 255]);
    expect(encodePNG).toHaveBeenCalledOnce();
  });

  it("limits snapshot bytes and skips oversized states without evicting the anchor", async () => {
    const NativeBlob = Blob;
    let snapshotSize = 40 * 1024 * 1024;
    // Override only snapshot accounting; the real PNGs and Blob data remain tiny.
    vi.stubGlobal(
      "Blob",
      class extends NativeBlob {
        constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
          super(parts, options);
          if (typeof parts[0] === "string" && parts[0].startsWith('{"currentState":')) {
            Object.defineProperty(this, "size", { value: snapshotSize });
          }
        }
      }
    );
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + Array.from({ length: 4 }, (_, index) => frame(index * 1000, index, 0, 0)).join(""));
    await seek(recording, 0);
    snapshotSize = 20 * 1024 * 1024;
    await seek(recording, 1000);
    await seek(recording, 2000);
    const encodePNG = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL");

    await seek(recording, 0);
    expect(pixel(recording)).toEqual([0, 0, 0, 255]);
    expect(encodePNG).not.toHaveBeenCalled();
    await seek(recording, 1000);
    expect(pixel(recording)).toEqual([1, 0, 0, 255]);
    expect(encodePNG).toHaveBeenCalledOnce();

    snapshotSize = 33 * 1024 * 1024;
    await seek(recording, 3000);
    await seek(recording, 0);
    encodePNG.mockClear();
    await seek(recording, 1000);
    expect(encodePNG).not.toHaveBeenCalled();
    await seek(recording, 3000);
    expect(pixel(recording)).toEqual([3, 0, 0, 255]);
    expect(encodePNG).toHaveBeenCalledOnce();
  });

  it.each(["blob", "tunnel"])(
    "decodes Unicode crossing a %s read boundary without corrupting frames",
    async (source) => {
      // The emoji starts at byte 262143, splitting its UTF-8 bytes across the 256 KiB read boundary.
      const dump =
        instruction("name", "a".repeat(262129) + "😀") + HEADER + frame(0, 255, 0, 0) + frame(1000, 0, 255, 0);
      const recording = createRecording(source === "blob" ? new Blob([dump]) : new Guacamole.StaticHTTPTunnel());
      const onload = vi.fn();
      const onerror = vi.fn();
      recording.onload = onload;
      recording.onerror = onerror;
      if (source === "tunnel") recording.connect(dump);

      await expect.poll(() => onload.mock.calls.length).toBe(1);
      await seek(recording, 1000);
      await expect.poll(() => pixel(recording)).toEqual(GREEN);
      expect(onerror).not.toHaveBeenCalled();
    }
  );

  it("makes small streamed frames playable before the download closes", async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body))
    );
    const recording = createRecording(new Guacamole.StaticHTTPTunnel("/stream.replay"));
    const onload = vi.fn();
    const onerror = vi.fn();
    recording.onload = onload;
    recording.onerror = onerror;
    recording.onprogress = () => recording.play();
    recording.connect();

    stream.enqueue(new TextEncoder().encode(HEADER + frame(100, 255, 0, 0)));
    await expect.poll(() => pixel(recording)).toEqual(RED);
    await expect.poll(() => recording.isPlaying()).toBe(false);
    expect(onload).not.toHaveBeenCalled();

    stream.enqueue(new TextEncoder().encode(frame(1100, 0, 255, 0)));
    await expect.poll(() => pixel(recording)).toEqual(GREEN);
    expect(recording.getDuration()).toBe(1000);
    expect(onload).not.toHaveBeenCalled();

    stream.close();
    await expect.poll(() => onload.mock.calls.length).toBe(1);
    expect(onerror).not.toHaveBeenCalled();
  });

  it("applies each additive frame once when a seek replaces an in-flight Blob read", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + frame(0, 10, 0, 0, 15) + frame(1000, 20, 0, 0, 15));
    const latestSeek = vi.fn();
    const readAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
    vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(function (this: FileReader, blob: Blob) {
      readAsArrayBuffer.call(this, blob);
      // Replace the seek while its first real FileReader operation is still pending.
      queueMicrotask(() => recording.seek(1000, latestSeek));
    });

    recording.seek(1000);

    await expect.poll(() => latestSeek.mock.calls.length).toBe(1);
    expect(recording.getPosition()).toBe(1000);
    expect(pixel(recording)).toEqual([30, 0, 0, 255]);
    expect(recording.isPlaying()).toBe(false);
  });

  it("keeps a later seek paused after pause interrupts a playing seek", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + frame(0, 255, 0, 0) + frame(5000, 0, 255, 0) + frame(10000, 0, 0, 255));
    recording.play();
    await expect.poll(() => pixel(recording)).toEqual(RED);

    const latestSeek = vi.fn();
    const readAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
    vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(function (this: FileReader, blob: Blob) {
      readAsArrayBuffer.call(this, blob);
      queueMicrotask(() => {
        recording.pause();
        recording.seek(5000, latestSeek);
      });
    });

    recording.seek(10000);

    await expect.poll(() => latestSeek.mock.calls.length).toBe(1);
    expect(pixel(recording)).toEqual(GREEN);
    expect(recording.isPlaying()).toBe(false);
  });

  it("completes the interrupted seek callback when play resumes playback", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + frame(0, 255, 0, 0) + frame(5000, 0, 255, 0) + frame(10000, 0, 0, 255));
    await seek(recording, 0);

    const interruptedSeek = vi.fn();
    const readAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
    vi.spyOn(FileReader.prototype, "readAsArrayBuffer").mockImplementationOnce(function (this: FileReader, blob: Blob) {
      readAsArrayBuffer.call(this, blob);
      queueMicrotask(() => recording.play());
    });

    recording.seek(5000, interruptedSeek);

    await expect.poll(() => interruptedSeek.mock.calls.length).toBe(1);
    expect(recording.isPlaying()).toBe(true);
  });

  it("reschedules active playback when speed changes and keeps paused seeks paused", async () => {
    const recording = createRecording(new Guacamole.StaticHTTPTunnel());
    recording.connect(HEADER + frame(0, 255, 0, 0) + frame(800, 0, 255, 0) + frame(1600, 0, 0, 255));
    expect(recording.getPlaybackRate()).toBe(1);
    recording.play();
    await expect.poll(() => pixel(recording)).toEqual(RED);

    await new Promise((resolve) => setTimeout(resolve, 150));
    recording.pause();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pixel(recording)).toEqual(RED);
    recording.play();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pixel(recording)).toEqual(RED);

    recording.setPlaybackRate(8);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(pixel(recording)).toEqual(RED);
    recording.setPlaybackRate(0);
    recording.setPlaybackRate(Number.NaN);
    expect(recording.getPlaybackRate()).toBe(8);
    await expect.poll(() => recording.isPlaying(), { timeout: 1500 }).toBe(false);
    expect(recording.getPosition()).toBe(1600);
    expect(pixel(recording)).toEqual(BLUE);

    await seek(recording, 800);
    await expect.poll(() => pixel(recording)).toEqual(GREEN);
    expect(recording.isPlaying()).toBe(false);
    recording.play();
    recording.pause();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(recording.isPlaying()).toBe(false);
    expect(recording.getPosition()).toBe(800);
    expect(pixel(recording)).toEqual(GREEN);
  });
});
