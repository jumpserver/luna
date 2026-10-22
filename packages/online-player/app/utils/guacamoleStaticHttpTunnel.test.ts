import Guacamole from "@jumpserver/guacamole";
import { gzipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

const DUMP = "4.size,1.0,3.800,3.600;4.sync,3.100;";
const EXPECTED = [
  ["size", ["0", "800", "600"]],
  ["sync", ["100"]]
];

function collectInstructions(tunnel: InstanceType<typeof Guacamole.StaticHTTPTunnel>) {
  const instructions: Array<[string, string[]]> = [];
  tunnel.oninstruction = (opcode: string, args: string[]) => {
    instructions.push([opcode, args.slice()]);
  };
  return instructions;
}

function responseChunks(chunks: Uint8Array[], headers?: HeadersInit) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      }
    }),
    { headers }
  );
}

async function waitForClose(tunnel: InstanceType<typeof Guacamole.StaticHTTPTunnel>) {
  await expect.poll(() => tunnel.state, { timeout: 2000 }).toBe(Guacamole.Tunnel.State.CLOSED);
}

describe("Guacamole.StaticHTTPTunnel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses and closes a local dump without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tunnel = new Guacamole.StaticHTTPTunnel();
    const instructions = collectInstructions(tunnel);
    const states: number[] = [];
    tunnel.onstatechange = (state: number) => states.push(state);

    tunnel.connect(DUMP);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(instructions).toEqual(EXPECTED);
    expect(states.slice(-2)).toEqual([Guacamole.Tunnel.State.OPEN, Guacamole.Tunnel.State.CLOSED]);
  });

  it("keeps a local tunnel closed when cancelled during connection", () => {
    const tunnel = new Guacamole.StaticHTTPTunnel();
    const instructions = collectInstructions(tunnel);
    tunnel.onstatechange = (state: number) => {
      if (state === Guacamole.Tunnel.State.CONNECTING) tunnel.disconnect();
    };

    tunnel.connect(DUMP);

    expect(tunnel.state).toBe(Guacamole.Tunnel.State.CLOSED);
    expect(instructions).toEqual([]);
  });

  it("streams UTF-8 instructions split inside a character", async () => {
    const dump = `4.name,2.中😀;${DUMP}`;
    const bytes = strToU8(dump);
    const split = strToU8("4.name,2.").length + 1;
    const fetchMock = vi.fn(async () => responseChunks([bytes.slice(0, split), bytes.slice(split)]));
    vi.stubGlobal("fetch", fetchMock);
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay", true, { Authorization: "test-token" });
    const instructions = collectInstructions(tunnel);

    tunnel.connect();
    await waitForClose(tunnel);

    expect(instructions).toEqual([["name", ["中😀"]], ...EXPECTED]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/mock.replay",
      expect.objectContaining({ credentials: "include", headers: { Authorization: "test-token" } })
    );
  });

  it("detects raw gzip even when the magic bytes arrive separately", async () => {
    const bytes = gzipSync(strToU8(DUMP));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responseChunks([bytes.slice(0, 1), bytes.slice(1)]))
    );
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay.gz");
    const instructions = collectInstructions(tunnel);

    tunnel.connect();
    await waitForClose(tunnel);

    expect(instructions).toEqual(EXPECTED);
  });

  it("does not inflate HTTP gzip that the browser has already decoded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(DUMP, { headers: { "content-encoding": "gzip", "content-type": "application/gzip" } })
      )
    );
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay.gz");
    const instructions = collectInstructions(tunnel);

    tunnel.connect();
    await waitForClose(tunnel);

    expect(instructions).toEqual(EXPECTED);
  });

  it.each(["http", "stream"])("reports a %s failure and closes", async (failure) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        failure === "http"
          ? new Response(null, { status: 404, statusText: "Not Found" })
          : new Response(new ReadableStream({ start: (controller) => controller.error(new Error("Read failed")) }))
      )
    );
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay");
    const onerror = vi.fn();
    tunnel.onerror = onerror;

    tunnel.connect();
    await waitForClose(tunnel);

    expect(onerror).toHaveBeenCalledOnce();
    expect(onerror.mock.calls[0]?.[0].message).toContain(failure === "http" ? "Not Found" : "Read failed");
  });

  it("aborts a pending download without reporting an error or consuming late data", async () => {
    let finishResponse!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishResponse = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay");
    const instructions = collectInstructions(tunnel);
    const onerror = vi.fn();
    tunnel.onerror = onerror;

    tunnel.connect();
    const signal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    tunnel.disconnect();
    finishResponse(new Response(DUMP));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(signal.aborted).toBe(true);
    expect(tunnel.state).toBe(Guacamole.Tunnel.State.CLOSED);
    expect(instructions).toEqual([]);
    expect(onerror).not.toHaveBeenCalled();
  });
});
