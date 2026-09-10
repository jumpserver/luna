import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";
import { describeTerminalClose } from "#koko/composables/terminal/protocol";
import { useKokoTerminalHeartbeat } from "#koko/composables/terminal/useTerminalHeartbeat";
import { useKokoTerminalTransport } from "#koko/composables/terminal/useTerminalTransport";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("distinguishes Koko session end, Koko timeout, offline and unexplained closes", () => {
  const abnormal = { code: 1006, reason: "", wasClean: false };
  expect(describeTerminalClose(abnormal, "idle_disconnect", false)).toMatchObject({
    source: "koko",
    reasonKey: "koko.terminal.closeReason.idle"
  });
  expect(
    describeTerminalClose({ ...abnormal, code: 4000, reason: "koko:read_timeout" }, undefined, true)
  ).toMatchObject({ source: "koko", reasonKey: "koko.terminal.closeReason.readTimeout" });
  expect(describeTerminalClose(abnormal, undefined, false).source).toBe("offline");
  expect(describeTerminalClose(abnormal, undefined, true).source).toBe("transport");
  expect(describeTerminalClose({ code: 1000, reason: "", wasClean: true }, undefined, true).source).toBe("unknown");
  expect(describeTerminalClose(abnormal, "", true).source).toBe("koko");
});

it("sends heartbeats only on open sockets, updates send time and stops after close", () => {
  vi.useFakeTimers();
  const socket = { readyState: WebSocket.CONNECTING as number, send: vi.fn() };
  const lastSendTime = ref(new Date());
  const lastReceiveTime = ref(new Date());
  const heartbeat = useKokoTerminalHeartbeat({
    socket: () => socket as unknown as WebSocket,
    lastSendTime,
    lastReceiveTime
  });
  heartbeat.start();
  vi.advanceTimersByTime(25_000);
  expect(socket.send).not.toHaveBeenCalled();
  socket.readyState = WebSocket.OPEN;
  vi.advanceTimersByTime(25_000);
  const frame = parseEnvelope(socket.send.mock.calls[0]![0]);
  expect(parseJSONPayload<{ command: string }>(frame.payload).command).toBe("PING");
  expect(lastSendTime.value.getTime()).toBe(Date.now());
  socket.readyState = WebSocket.CLOSED;
  vi.advanceTimersByTime(25_000);
  expect(heartbeat.intervalRef.value).toBeNull();
  expect(socket.send).toHaveBeenCalledTimes(1);
});

it("warns once on missing inbound traffic without closing a potentially throttled connection", () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const socket = { readyState: WebSocket.OPEN, send: vi.fn(), close: vi.fn() };
  const lastReceiveTime = ref(new Date());
  const heartbeat = useKokoTerminalHeartbeat({
    socket: () => socket as unknown as WebSocket,
    lastSendTime: ref(new Date()),
    lastReceiveTime
  });
  heartbeat.start();
  vi.advanceTimersByTime(100_000);
  expect(warn).toHaveBeenCalledTimes(1);
  lastReceiveTime.value = new Date();
  vi.advanceTimersByTime(25_000);
  vi.advanceTimersByTime(75_000);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(socket.close).not.toHaveBeenCalled();
  heartbeat.stop();
});

it("does not create an unbound replacement socket after a disconnect", () => {
  vi.useFakeTimers();
  const sockets: Array<{ onclose?: (event: CloseEvent) => void; close: ReturnType<typeof vi.fn> }> = [];
  class TestWebSocket {
    onclose?: (event: CloseEvent) => void;
    close = vi.fn();
    constructor() {
      sockets.push(this);
    }
  }
  vi.stubGlobal("WebSocket", TestWebSocket);
  const scope = effectScope();
  const transport = scope.run(() => {
    const transport = useKokoTerminalTransport();
    transport.connect("ws://localhost/terminal");
    return transport;
  })!;
  sockets[0]!.onclose?.({ code: 1006, reason: "", wasClean: false } as CloseEvent);
  vi.advanceTimersByTime(30_000);
  expect(sockets).toHaveLength(1);
  transport.close();
  expect(sockets[0]!.close).toHaveBeenCalledWith(1000, "luna:client_close");
  expect(transport.socket.value).toBeNull();
  scope.stop();
});
