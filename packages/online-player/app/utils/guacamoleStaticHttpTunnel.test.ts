import { createRequire } from "node:module";
import { gzipSync, strToU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const Guacamole = require("guacamole-common-js-jumpserver/dist/guacamole-common") as {
  Tunnel: { State: { OPEN: number; CLOSED: number } };
  StaticHTTPTunnel: new (url?: string) => {
    connect: (data?: string) => void;
    disconnect: () => void;
    oninstruction: ((opcode: string, args: string[]) => void) | null;
    onstatechange: ((state: number) => void) | null;
    onerror: ((status: { message?: string }) => void) | null;
  };
};

const DUMP = "4.size,1.0,3.800,3.600;4.sync,3.100;";

function collectInstructions(tunnel: InstanceType<typeof Guacamole.StaticHTTPTunnel>) {
  const instructions: Array<[string, string[]]> = [];
  tunnel.oninstruction = (opcode, args) => {
    instructions.push([opcode, args.slice()]);
  };
  return instructions;
}

function waitForClose(tunnel: InstanceType<typeof Guacamole.StaticHTTPTunnel>) {
  return new Promise<void>((resolve, reject) => {
    let opened = false;
    const timer = setTimeout(() => reject(new Error("tunnel did not close")), 2000);
    tunnel.onstatechange = (state) => {
      if (state === Guacamole.Tunnel.State.OPEN) opened = true;
      if (state !== Guacamole.Tunnel.State.CLOSED || !opened) return;
      clearTimeout(timer);
      resolve();
    };
  });
}

describe("patched Guacamole.StaticHTTPTunnel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a local dump without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tunnel = new Guacamole.StaticHTTPTunnel();
    const instructions = collectInstructions(tunnel);

    tunnel.connect(DUMP);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(instructions).toEqual([
      ["size", ["0", "800", "600"]],
      ["sync", ["100"]]
    ]);
  });

  it("streams a remote dump over HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(DUMP, { status: 200, headers: { "content-type": "text/plain" } }))
    );
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay");
    const instructions = collectInstructions(tunnel);
    const closed = waitForClose(tunnel);

    tunnel.connect("");
    await closed;

    expect(instructions).toEqual([
      ["size", ["0", "800", "600"]],
      ["sync", ["100"]]
    ]);
  });

  it("inflates a raw gzip recording while streaming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(gzipSync(strToU8(DUMP)), {
            status: 200,
            headers: { "content-type": "application/gzip" }
          })
      )
    );
    const tunnel = new Guacamole.StaticHTTPTunnel("/mock.replay.gz");
    const instructions = collectInstructions(tunnel);
    const closed = waitForClose(tunnel);

    tunnel.connect("");
    await closed;

    expect(instructions).toEqual([
      ["size", ["0", "800", "600"]],
      ["sync", ["100"]]
    ]);
  });
});
