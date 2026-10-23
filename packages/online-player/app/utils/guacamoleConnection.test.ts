import Guacamole from "@jumpserver/guacamole";
import { afterEach, describe, expect, it, vi } from "vitest";

// Replace only the network endpoint; Client, WebSocketTunnel, Parser and drawing stay real.
class SocketEndpoint {
  static instances: SocketEndpoint[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  send = vi.fn<(message: string) => void>();
  close = vi.fn();

  constructor(
    readonly url: string,
    readonly protocol: string
  ) {
    SocketEndpoint.instances.push(this);
  }

  receive(data: string) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  messages() {
    return this.send.mock.calls.map(([message]) => message);
  }
}

describe.skipIf(typeof document === "undefined")("Guacamole live connection", () => {
  const clients: Guacamole.Client[] = [];

  function connection() {
    vi.stubGlobal("WebSocket", SocketEndpoint);
    const tunnel = new Guacamole.WebSocketTunnel("wss://guacamole.test/tunnel");
    const client = new Guacamole.Client(tunnel);
    clients.push(client);
    const states: number[] = [];
    client.onstatechange = (state) => states.push(state);
    client.sendKeyEvent(1, 65);
    client.connect("token=test&GUAC_WIDTH=1&GUAC_HEIGHT=1");
    const socket = SocketEndpoint.instances.at(-1)!;
    socket.onopen?.(new Event("open"));
    socket.receive("0.,8.live-123;");
    return { client, tunnel, socket, states };
  }

  afterEach(() => {
    for (const client of clients.splice(0)) {
      client.disconnect();
      client.getDisplay().cancel();
    }
    SocketEndpoint.instances.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["png", "img"])(
    "draws %s before acknowledging sync and sends live input without recording",
    async (opcode) => {
      const recording = vi.spyOn(Guacamole, "SessionRecording");
      const { client, tunnel, socket, states } = connection();
      const snapshot = vi.spyOn(client, "exportState");
      expect(socket.url).toBe("wss://guacamole.test/tunnel?token=test&GUAC_WIDTH=1&GUAC_HEIGHT=1");
      expect(socket.protocol).toBe("guacamole");
      expect(tunnel.uuid).toBe("live-123");
      expect(tunnel.state).toBe(Guacamole.Tunnel.State.OPEN);
      expect(states).toEqual([1, 2]); // CONNECTING, WAITING until the first sync.
      expect(socket.messages().some((message) => message.startsWith("3.key,"))).toBe(false);

      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "red";
      context.fillRect(0, 0, 1, 1);
      const png = canvas.toDataURL("image/png").split(",")[1]!;
      canvas.width = canvas.height = 0;
      const drawing =
        opcode === "png"
          ? `3.png,2.12,1.0,1.0,1.0,${png.length}.${png};`
          : `3.img,1.1,2.12,1.0,9.image/png,1.0,1.0;4.blob,1.1,${png.length}.${png};3.end,1.1;`;
      const frame = `4.size,1.0,1.1,1.1;${drawing}4.sync,3.123;`;
      // A real WebSocket message need not end at a Guacamole instruction boundary.
      for (let offset = 0; offset < frame.length; offset += 13) socket.receive(frame.slice(offset, offset + 13));
      expect(states).toEqual([1, 2, 3]);
      expect(socket.messages()).not.toContain("4.sync,3.123;");
      await expect.poll(() => socket.messages()).toContain("4.sync,3.123;");
      const pixels = client.getDisplay().getDefaultLayer().getCanvas().getContext("2d")!;
      expect(Array.from(pixels.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255]);
      socket.receive("4.sync,3.123;");
      expect(socket.messages().filter((message) => message === "4.sync,3.123;")).toHaveLength(1);

      client.sendKeyEvent(1, 65);
      client.sendKeyEvent(0, 65);
      client.sendMouseState(new Guacamole.Mouse.State(12.9, 8.5, true, false, true, false, false));
      expect(socket.messages()).toEqual(
        expect.arrayContaining(["3.key,2.65,1.1;", "3.key,2.65,1.0;", "5.mouse,2.12,1.8,1.5;"])
      );

      client.disconnect();
      expect(states).toEqual([1, 2, 3, 4, 5]);
      expect(tunnel.state).toBe(Guacamole.Tunnel.State.CLOSED);
      expect(socket.close).toHaveBeenCalledOnce();
      expect(socket.messages().at(-1)).toBe("10.disconnect;");
      const sent = socket.messages().length;
      client.sendKeyEvent(1, 66);
      client.sendMouseState(new Guacamole.Mouse.State(0, 0, false, false, false, false, false));
      client.disconnect();
      expect(socket.messages()).toHaveLength(sent);
      expect(recording).not.toHaveBeenCalled();
      expect(snapshot).not.toHaveBeenCalled();
    }
  );

  it("sends UTF-8 clipboard text and receives text split across UTF-8 byte boundaries", () => {
    const { client, socket } = connection();
    socket.receive("4.sync,1.1;");
    const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const text = "中文 café";
    const encoded = base64(new TextEncoder().encode(text));
    const writer = new Guacamole.StringWriter(client.createClipboardStream("text/plain"));
    writer.sendText(text);
    writer.sendEnd();
    expect(socket.messages()).toEqual(
      expect.arrayContaining([
        "9.clipboard,1.0,10.text/plain;",
        `4.blob,1.0,${encoded.length}.${encoded};`,
        "3.end,1.0;"
      ])
    );

    let received = "";
    const ended = vi.fn();
    client.onclipboard = (stream, mimetype) => {
      expect(mimetype).toBe("text/plain");
      const reader = new Guacamole.StringReader(stream);
      reader.ontext = (chunk) => (received += chunk);
      reader.onend = ended;
    };
    socket.receive("9.clipboard,1.7,10.text/plain;");
    const incoming = new TextEncoder().encode(text);
    for (const bytes of [incoming.slice(0, 2), incoming.slice(2)]) {
      const chunk = base64(bytes);
      socket.receive(`4.blob,1.7,${chunk.length}.${chunk};`);
    }
    expect(received).toBe(text);
    expect(ended).not.toHaveBeenCalled();
    socket.receive("3.end,1.7;3.end,1.7;");
    expect(ended).toHaveBeenCalledOnce();
  });

  it("acknowledges downloaded file bytes and parses filenames by Unicode codepoint", async () => {
    const { client, socket } = connection();
    socket.receive("4.sync,1.1;");
    const ended = vi.fn();
    let file: Blob | undefined;
    const received = vi.fn<(stream: Guacamole.InputStream, mimetype: string, filename: string) => void>(
      (stream, mimetype) => {
        const reader = new Guacamole.BlobReader(stream, mimetype);
        reader.onend = () => {
          file = reader.getBlob();
          ended();
        };
      }
    );
    client.onfile = received;
    // Five Unicode codepoints, despite occupying six UTF-16 code units.
    socket.receive("4.file,1.9,24.application/octet-stream,5.😀.bin;");
    expect(received).toHaveBeenCalledOnce();
    expect(received.mock.calls[0]!.slice(1)).toEqual(["application/octet-stream", "😀.bin"]);
    socket.receive("4.blob,1.9,8.AAEC/w==;3.end,1.9;");
    expect(ended).toHaveBeenCalledOnce();
    expect(Array.from(new Uint8Array(await file!.arrayBuffer()))).toEqual([0, 1, 2, 255]);
    expect(socket.messages().filter((message) => message === "3.ack,1.9,2.OK,1.0;")).toHaveLength(1);
    socket.receive("4.blob,1.9,8.AAEC/w==;3.end,1.9;");
    expect(ended).toHaveBeenCalledOnce();
    expect(socket.messages().filter((message) => message === "3.ack,1.9,2.OK,1.0;")).toHaveLength(1);
  });

  it("routes filesystem upload acknowledgements and stops them when the output stream ends", () => {
    const { client, socket } = connection();
    socket.receive("4.sync,1.1;");
    const filesystem = vi.fn<(object: Guacamole.Object, name: string) => void>();
    client.onfilesystem = filesystem;
    socket.receive("10.filesystem,1.3,5.drive;");
    const object = filesystem.mock.calls[0]![0];
    const stream = object.createOutputStream("application/octet-stream", "/报告.bin");
    expect(socket.messages()).toContain("3.put,1.3,1.0,24.application/octet-stream,7./报告.bin;");
    const acknowledged = vi.fn((status: Guacamole.Status) => {
      expect(status.isError()).toBe(false);
      stream.sendBlob("AAEC/w==");
      stream.sendEnd();
    });
    stream.onack = acknowledged;
    expect(socket.messages().some((message) => message.startsWith("4.blob,"))).toBe(false);
    socket.receive("3.ack,1.0,5.Ready,1.0;");
    expect(acknowledged).toHaveBeenCalledOnce();
    expect(socket.messages()).toEqual(expect.arrayContaining(["4.blob,1.0,8.AAEC/w==;", "3.end,1.0;"]));
    socket.receive("3.ack,1.0,2.OK,1.0;");
    expect(acknowledged).toHaveBeenCalledOnce();
  });

  it("reports a server protocol error and closes the live tunnel", () => {
    const { client, tunnel, socket, states } = connection();
    const error = vi.fn();
    client.onerror = error;
    socket.receive("4.sync,1.1;5.error,6.denied,3.512;");
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]![0]).toMatchObject({ code: Guacamole.Status.Code.SERVER_ERROR, message: "denied" });
    expect(states).toEqual([1, 2, 3, 4, 5]);
    expect(tunnel.state).toBe(Guacamole.Tunnel.State.CLOSED);
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
