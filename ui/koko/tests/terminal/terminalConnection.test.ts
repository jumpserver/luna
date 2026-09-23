import { afterEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import { parseEnvelope, parseJSONPayload } from "#koko/composables/terminal/envelope";
import {
  createKokoStartupOutputCapture,
  describeTerminalClose,
  resolveKokoTerminalCloseMessage
} from "#koko/composables/terminal/protocol";
import { useKokoTerminalHeartbeat } from "#koko/composables/terminal/useTerminalHeartbeat";
import { useKokoTerminalTransport } from "#koko/composables/terminal/useTerminalTransport";
import { normalizeConnectionFailure } from "~/utils/connectionFailure";
import terminalSocketSource from "../../composables/terminal/useTerminalSocket.ts?raw";

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

it("uses sanitized startup bytes for an early close and clears them once ready", () => {
  const capture = createKokoStartupOutputCapture();
  const fallback = "Koko 已结束会话：资产连接已结束";
  const encoded = new TextEncoder().encode("\u001b[31m认证失败\u001b[0m");
  const prefixBytes = new TextEncoder().encode("\u001b[31m").length;
  const splitAt = prefixBytes + 1;

  expect(new TextEncoder().encode("认").length).toBeGreaterThan(1);
  capture.append(encoded.slice(0, splitAt));
  capture.append(encoded.slice(splitAt));
  const startup = normalizeConnectionFailure(capture.take());

  expect(startup).toBe("认证失败");
  expect(normalizeConnectionFailure("开始连接\r\nssh: handshake failed: EOF")).toBe(
    "开始连接\nssh: handshake failed: EOF"
  );
  expect(startup).not.toContain("\u001b");
  expect(resolveKokoTerminalCloseMessage(startup, fallback)).toBe("认证失败");

  capture.markReady();
  capture.append(new TextEncoder().encode("must not replace the close reason"));
  expect(resolveKokoTerminalCloseMessage(normalizeConnectionFailure(capture.take()), fallback)).toBe(fallback);
});

it("keeps only the last 8 KiB of startup output", () => {
  const limit = 8 * 1024;
  const capture = createKokoStartupOutputCapture(limit);
  const encoder = new TextEncoder();

  capture.append(encoder.encode("x".repeat(limit)));
  capture.append(encoder.encode("tail"));

  expect(capture.take()).toBe(`${"x".repeat(limit - 4)}tail`);
});

it("reads sanitized startup bytes on close instead of the xterm buffer", () => {
  expect(terminalSocketSource).toContain("normalizeConnectionFailure(startupOutput.take())");
  expect(terminalSocketSource).toContain("socketOpened = true");
  expect(terminalSocketSource).toContain("{ dismissible: socketOpened }");
  expect(terminalSocketSource).toContain("onTerminalReady: startupOutput.markReady");
  expect(terminalSocketSource).not.toContain("getXTerminalLineContent");
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
