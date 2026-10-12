import { afterEach, beforeEach, expect, it, vi } from "vitest";

const browserLocks = typeof window === "undefined" ? undefined : navigator.locks;
vi.stubGlobal("defineNuxtPlugin", (plugin: unknown) => plugin);
const plugin = (await import("../plugins/session-freeze-protection.client")).default as unknown as { setup(): void };

class FakeWebSocket extends EventTarget {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  constructor(
    url: string | URL,
    readonly protocols?: string | string[]
  ) {
    super();
    this.url = new URL(String(url), "wss://example.test").href;
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.dispatchEvent(new Event("close"));
  }
}

let requests: Array<{ name: string; signal: AbortSignal; mode?: LockMode; grant: () => Promise<void> | void }>;
beforeEach(() => {
  requests = [];
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  if (typeof window === "undefined") vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", {
    locks: {
      request: (name: string, options: LockOptions, callback: () => Promise<void> | void) => {
        requests.push({ name, signal: options.signal!, mode: options.mode, grant: callback });
        return new Promise<void>((_resolve, reject) => {
          options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
            once: true
          });
        });
      }
    }
  });
});
afterEach(() => {
  for (const socket of FakeWebSocket.instances) socket.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("covers all connector paths, site prefixes and desktop origins without protecting unrelated sockets", () => {
  plugin.setup();
  for (const path of [
    "/koko/ws/terminal/",
    "/koko/ws/share/",
    "/koko/ws/monitor/",
    "/koko/ws/sftp/",
    "/koko/lion/ws/connect/",
    "/chen/ws/session",
    "/site/chen/ws/console"
  ]) {
    expect(new WebSocket(`wss://remote-endpoint.test${path}?token=test`)).toBeInstanceOf(FakeWebSocket);
  }
  expect(requests).toHaveLength(7);
  expect(new WebSocket("wss://example.test/vite-hmr")).toBeInstanceOf(FakeWebSocket);
  expect(new WebSocket("wss://example.test/other?redirect=/koko/ws/terminal/")).toBeInstanceOf(FakeWebSocket);
  expect(requests).toHaveLength(7);
});

it("preserves constructor arguments, constants, instanceof and subclasses", () => {
  plugin.setup();
  const stringify = vi.fn(() => "wss://example.test/koko/ws/terminal/");
  const socket = new WebSocket({ toString: stringify } as unknown as URL, ["JMS-KOKO"]);
  expect(stringify).toHaveBeenCalledTimes(1);
  expect(socket).toBeInstanceOf(WebSocket);
  expect(socket).toBeInstanceOf(FakeWebSocket);
  expect((socket as unknown as FakeWebSocket).protocols).toEqual(["JMS-KOKO"]);
  expect(WebSocket.OPEN).toBe(FakeWebSocket.OPEN);
  class DerivedWebSocket extends WebSocket {}
  expect(new DerivedWebSocket("wss://example.test/chen/ws/session")).toBeInstanceOf(DerivedWebSocket);
});

it("holds independent shared locks while connecting and releases each on close", async () => {
  plugin.setup();
  const first = new WebSocket("wss://example.test/koko/ws/terminal/");
  const second = new WebSocket("wss://example.test/chen/ws/session");
  expect(requests.every(({ mode }) => mode === "shared")).toBe(true);
  expect(requests[0]!.name).toBe(requests[1]!.name);
  const released = vi.fn();
  const firstLock = Promise.resolve(requests[0]!.grant()).then(released);
  const secondLock = requests[1]!.grant();
  await Promise.resolve();
  expect(released).not.toHaveBeenCalled();
  first.close();
  first.close();
  await firstLock;
  expect(requests[0]!.signal.aborted).toBe(true);
  expect(requests[1]!.signal.aborted).toBe(false);
  second.close();
  await secondLock;
});

it.each(["close", "error"])("cancels a pending lock on %s without a spurious warning", async (event) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  plugin.setup();
  const socket = new WebSocket("wss://example.test/koko/ws/terminal/");
  socket.dispatchEvent(new Event(event));
  expect(requests[0]!.signal.aborted).toBe(true);
  expect(requests[0]!.grant()).toBeUndefined();
  await Promise.resolve();
  expect(warn).not.toHaveBeenCalled();
});

it("leaves the native constructor unchanged when Web Locks are unavailable", () => {
  vi.stubGlobal("navigator", {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  plugin.setup();
  expect(window.WebSocket).toBe(FakeWebSocket);
});

it.each([false, true])("does not break socket construction when acquiring a lock fails (sync: %s)", async (sync) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("navigator", {
    locks: {
      request: () => {
        const error = new DOMException("Denied", "SecurityError");
        if (sync) throw error;
        return Promise.reject(error);
      }
    }
  });
  plugin.setup();
  expect(new WebSocket("wss://example.test/koko/ws/terminal/")).toBeInstanceOf(FakeWebSocket);
  await Promise.resolve();
  expect(warn).toHaveBeenCalledTimes(1);
});

it.skipIf(!browserLocks)("holds and releases real browser locks through the global constructor", async () => {
  vi.stubGlobal("navigator", { locks: browserLocks });
  plugin.setup();
  const heldCount = async () =>
    (await browserLocks!.query()).held!.filter(({ name }) => name === "jumpserver:luna:active-session").length;
  const baseline = await heldCount();
  const first = new WebSocket("wss://example.test/koko/ws/terminal/");
  const second = new WebSocket("wss://example.test/koko/lion/ws/connect/");
  await expect.poll(heldCount).toBe(baseline + 2);
  first.close();
  await expect.poll(heldCount).toBe(baseline + 1);
  second.close();
  await expect.poll(heldCount).toBe(baseline);
});
