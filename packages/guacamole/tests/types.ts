import Guacamole from "@jumpserver/guacamole";
import { createRecordingSource } from "@jumpserver/guacamole/recording-source";

// Compile-only contracts: incorrect calls must fail, including if the entry regresses to any.
export function checkRecordingTypes(blob: Blob) {
  const tunnel: Guacamole.StaticHTTPTunnel = new Guacamole.StaticHTTPTunnel();
  tunnel.connect("4.sync,1.0;");
  const recording: Guacamole.SessionRecording = new Guacamole.SessionRecording(tunnel);
  void new Guacamole.SessionRecording(blob);
  const source: Guacamole.SessionRecording.Source = {
    async *stream(signal?: AbortSignal) {
      if (!signal?.aborted) yield new Uint8Array(0);
    },
    async read(start, end) {
      return blob.slice(start, end);
    },
    close() {}
  };
  new Guacamole.SessionRecording(source).dispose();
  const fileSource: Guacamole.SessionRecording.Source = createRecordingSource(blob);
  new Guacamole.SessionRecording(fileSource).dispose();
  createRecordingSource("jms-asset://recording", { disk: true }).close();
  createRecordingSource({ stream: () => blob.stream() }).close();
  // @ts-expect-error Input data must be a URL, Blob/File or streaming input.
  createRecordingSource(new Uint8Array(1));
  // @ts-expect-error Streaming input must return readable bytes.
  createRecordingSource({ stream: () => new ReadableStream<string>() });
  recording.setPlaybackRate(2);
  recording.setPlaybackRate(recording.getPlaybackRate());
  recording.connect();
  recording.seek(1000, () => recording.pause());
  recording.cancel();
  recording.abort();
  recording.onprogress = (duration, parsedSize) => {
    const progress: [number, number] = [duration, parsedSize];
    void progress;
  };
  recording.onseek = (position, current, total) => {
    const progress: [number, number, number] = [position, current, total];
    void progress;
  };
  recording.onerror = (message) => message.toUpperCase();
  tunnel.onerror = (status) => status.isError();
  recording.onload = recording.onprogress = recording.onseek = recording.onerror = recording.onabort = null;
  tunnel.onerror = tunnel.oninstruction = tunnel.onstatechange = null;

  // @ts-expect-error Source reads must be asynchronous.
  const invalidRead: Guacamole.SessionRecording.Source["read"] = () => blob;
  void invalidRead;
  // @ts-expect-error A recording requires a protocol tunnel, Blob or seekable source.
  void new Guacamole.SessionRecording({});
  // @ts-expect-error The pinned 1.5.5 implementation has no refreshInterval parameter.
  void new Guacamole.SessionRecording(blob, 1000);
  // @ts-expect-error Playback rates are numeric.
  recording.setPlaybackRate("2");
  // @ts-expect-error Recording errors are text, not tunnel status objects.
  recording.onerror = (status: Guacamole.Status) => status.isError();
}

export function checkClientTypes(element: HTMLElement, layout: Guacamole.OnScreenKeyboard.Layout) {
  const client: Guacamole.Client = new Guacamole.Client(new Guacamole.WebSocketTunnel("/socket"));
  const display: Guacamole.Display = client.getDisplay();
  const layer: Guacamole.Display.VisibleLayer = new Guacamole.Display.VisibleLayer(640, 480);
  const canvas: HTMLCanvasElement = display.getDefaultLayer().getCanvas();
  const sink: HTMLTextAreaElement = new Guacamole.InputSink().getElement();
  const mouse = new Guacamole.Mouse(element);
  mouse.onmousedown = (state) => client.sendMouseState(state);
  mouse.onmousedown = null;
  client.sendMouseState(new Guacamole.Mouse.State({ x: 1, y: 2, left: true }));
  client.sendMouseState(new Guacamole.Mouse.State(1, 2, true, false, false, false, false));
  const keyboard = new Guacamole.Keyboard(element);
  keyboard.onkeydown = (keysym) => {
    client.sendKeyEvent(1, keysym);
    return false;
  };
  const osk = new Guacamole.OnScreenKeyboard(layout);
  osk.onkeydown = (keysym) => client.sendKeyEvent(1, keysym);
  osk.onkeyup = (keysym) => client.sendKeyEvent(0, keysym);
  osk.onkeydown = osk.onkeyup = null;
  display.onresize = null;
  void canvas;
  void layer;
  void sink;

  // @ts-expect-error VisibleLayer is a nested runtime constructor, not a top-level export.
  void new Guacamole.VisibleLayer(640, 480);
  // @ts-expect-error Client states are type-only numeric codes in the 1.5.5 runtime.
  void Guacamole.Client.State.CONNECTED;
  // @ts-expect-error Guacamole keysyms are numbers.
  osk.onkeydown = (keysym: string) => keysym.toUpperCase();
  // @ts-expect-error String keysyms must not cross the client boundary.
  client.sendKeyEvent(1, "65507");
  // @ts-expect-error Only the default namespace is exported by the runtime package.
  void import("@jumpserver/guacamole").then((module) => module.Client);
}

export function checkStreamTypes(stream: Guacamole.InputStream) {
  void new Guacamole.DataURIReader(stream, "image/png");
  // @ts-expect-error The runtime requires a MIME type when constructing the data URI.
  void new Guacamole.DataURIReader(stream);
  const format = Guacamole.RawAudioFormat.parse("audio/L16;rate=44100,channels=2");
  // @ts-expect-error Unsupported audio formats return null.
  const rate: number = format.rate;
  void rate;
}
