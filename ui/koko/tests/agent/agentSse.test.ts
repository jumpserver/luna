import { expect, it, vi } from "vitest";
import {
  AgentSseConnection,
  AgentStreamHttpError,
  createAgentSseParser,
  openAgentStream
} from "#koko/composables/agent/agentSse";
import { isDesktopRuntime } from "~/utils/runtime";

vi.mock("~/utils/runtime", async (original) => ({
  ...(await original<typeof import("~/utils/runtime")>()),
  isDesktopRuntime: vi.fn(() => false)
}));

it("cancels an Electron stream even before its start request returns", async () => {
  vi.mocked(isDesktopRuntime).mockReturnValueOnce(true);
  let started!: () => void;
  const pendingStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const invoke = vi.fn((command: string) => (command === "api_stream_start" ? pendingStart : Promise.resolve()));
  vi.stubGlobal("__JMS_DESKTOP__", {
    invoke,
    listen: vi.fn().mockResolvedValue({ eventId: 1, callbackId: 1 }),
    unlisten: vi.fn().mockResolvedValue(undefined)
  });
  const controller = new AbortController();
  const onOpen = vi.fn();
  try {
    const stream = openAgentStream({
      sessionId: "panel-1",
      resourceSessionId: "resource-1",
      after: 7,
      signal: controller.signal,
      onOpen,
      onChunk: vi.fn()
    });
    const rejected = expect(stream).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("api_stream_start", expect.anything()));
    controller.abort();
    await rejected;
    started();
    await pendingStart;
    expect(onOpen).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith("api_stream_cancel", expect.anything());
  } finally {
    controller.abort();
    started();
    vi.unstubAllGlobals();
  }
});

it("resumes the original stream after a long offline period without losing or repeating messages", async () => {
  const network = typeof window === "undefined" ? new EventTarget() : window;
  const navigator = { onLine: true };
  if (typeof window === "undefined") vi.stubGlobal("window", network);
  vi.stubGlobal("navigator", navigator);
  let now = 0;
  const events: number[] = [];
  const cursors: number[] = [];
  const onUnavailable = vi.fn();
  const connection = new AgentSseConnection({
    sessionId: "panel-1",
    resourceSessionId: "resource-1",
    now: () => now,
    opener: async ({ after, onOpen, onChunk, signal }) => {
      cursors.push(after);
      onOpen();
      onChunk('data: {"seq":1,"type":"message.delta","payload":{"delta":"first"}}\n\n');
      if (cursors.length > 1) {
        onChunk('data: {"seq":2,"type":"message.delta","payload":{"delta":"second"}}\n\n');
        onChunk('data: {"seq":3,"type":"run.completed","run_id":"run-1"}\n\n');
      }
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      );
    },
    onEvent: (event) => events.push(event.seq),
    onUnavailable
  });
  try {
    const running = connection.start();
    expect(events).toEqual([1]);
    navigator.onLine = false;
    network.dispatchEvent(new Event("offline"));
    await Promise.resolve();
    now = 120_000;
    expect(cursors).toEqual([0]);
    navigator.onLine = true;
    network.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(events).toEqual([1, 2, 3]));
    expect(cursors).toEqual([0, 1]);
    expect(onUnavailable).not.toHaveBeenCalled();
    connection.stop();
    await running;
  } finally {
    connection.stop();
    vi.unstubAllGlobals();
  }
});

it.each([
  new AgentStreamHttpError(409, '{"code":"panel_closed"}'),
  new Error('api stream failed: status=409, body={"code":"panel_expired"}')
])("hands an expired browser or desktop panel back without reconnecting it", async (error) => {
  const opener = vi.fn().mockRejectedValue(error);
  const wait = vi.fn();
  const onUnavailable = vi.fn();
  const connection = new AgentSseConnection({
    sessionId: "expired",
    resourceSessionId: "resource-1",
    opener,
    wait,
    onUnavailable,
    onEvent: vi.fn()
  });
  await connection.start();
  expect(opener).toHaveBeenCalledOnce();
  expect(onUnavailable).toHaveBeenCalledExactlyOnceWith(error);
  expect(wait).not.toHaveBeenCalled();
});

it("parses bounded split SSE events with ids and multiline data", () => {
  const events: unknown[] = [];
  const parser = createAgentSseParser((event) => events.push(event));
  parser.push('event: message.delta\nid: 2\ndata: {"seq":2,\n');
  parser.push('data: "type":"message.delta","payload":{"delta":"ok"}}\n\n');
  parser.finish();

  expect(events).toEqual([{ seq: 2, type: "message.delta", payload: { delta: "ok" } }]);
  expect(() => createAgentSseParser(() => undefined, { maxBufferBytes: 4 }).push("12345")).toThrow(
    "Agent SSE buffer exceeds"
  );
});

it("accepts a 256 KiB Agent payload envelope and still rejects oversized events", () => {
  const events: unknown[] = [];
  const payload = "x".repeat(256 * 1024);
  const parser = createAgentSseParser((event) => events.push(event));
  parser.push(`data: ${JSON.stringify({ seq: 1, type: "tool.result", payload: { content: payload } })}\n\n`);
  parser.finish();

  expect(events).toHaveLength(1);
  expect((events[0] as { payload: { content: string } }).payload.content).toHaveLength(256 * 1024);

  const oversized = createAgentSseParser(() => undefined);
  expect(() =>
    oversized.push(
      `data: ${JSON.stringify({ seq: 2, type: "tool.result", payload: { content: "x".repeat(321 * 1024) } })}\n\n`
    )
  ).toThrow("Agent SSE event exceeds");
});

it("maps canonical Kael capability events into the existing workspace event model", () => {
  const events: unknown[] = [];
  const parser = createAgentSseParser((event) => events.push(event));
  parser.push(
    'event: approval.required\nid: 4\ndata: {"seq":4,"type":"approval.required","panel_session_id":"panel-1","run_id":"run-1","approval_id":"approval-1","payload":{"arguments_digest":"digest-1"}}\n\n'
  );

  expect(events).toEqual([
    {
      seq: 4,
      type: "approval.requested",
      session_id: "panel-1",
      run_id: "run-1",
      approval_id: "approval-1",
      payload: { arguments_digest: "digest-1", digest: "digest-1" }
    }
  ]);
});

it("reconnects from the last delivered sequence and drops replayed events", async () => {
  const events: number[] = [];
  const after: number[] = [];
  const states: string[] = [];
  let attempt = 0;
  const connection = new AgentSseConnection({
    sessionId: "agent-1",
    resourceSessionId: "resource-1",
    opener: async ({ after: cursor, signal, onOpen, onChunk }) => {
      after.push(cursor);
      onOpen();
      attempt += 1;
      if (attempt === 1) {
        onChunk('data: {"seq":1,"type":"heartbeat"}\n\n');
        throw new Error("disconnected");
      }
      onChunk('data: {"seq":1,"type":"heartbeat"}\n\ndata: {"seq":2,"type":"run.started"}\n\n');
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
    wait: async () => undefined,
    onEvent: (event) => events.push(event.seq),
    onState: (state) => states.push(state)
  });

  const running = connection.start();
  await vi.waitFor(() => expect(events).toEqual([1, 2]));
  connection.stop();
  await running;

  expect(after.slice(0, 2)).toEqual([0, 1]);
  expect(states).toContain("reconnecting");
});

it("does not advance the cursor until the event consumer succeeds", async () => {
  const after: number[] = [];
  let attempt = 0;
  let rejectEvent = true;
  const connection = new AgentSseConnection({
    sessionId: "agent-1",
    resourceSessionId: "resource-1",
    opener: async ({ after: cursor, signal, onOpen, onChunk }) => {
      after.push(cursor);
      onOpen();
      attempt += 1;
      onChunk('data: {"seq":1,"type":"tool.call"}\n\n');
      if (attempt > 1) {
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      }
    },
    wait: async () => undefined,
    onEvent: () => {
      if (rejectEvent) {
        rejectEvent = false;
        throw new Error("Koko relay unavailable");
      }
    }
  });

  const running = connection.start();
  await vi.waitFor(() => expect(after).toEqual([0, 0]));
  expect(connection.after).toBe(1);
  connection.stop();
  await running;
});

it("repairs an expired SSE cursor through history before reconnecting", async () => {
  const after: number[] = [];
  const onCursorExpired = vi.fn().mockResolvedValue(7);
  let attempt = 0;
  const connection = new AgentSseConnection({
    sessionId: "agent-1",
    resourceSessionId: "resource-1",
    after: 3,
    opener: async ({ after: cursor, signal }) => {
      after.push(cursor);
      attempt += 1;
      if (attempt === 1) {
        throw new AgentStreamHttpError(410, '{"code":"cursor_expired"}');
      }
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
    onCursorExpired,
    onEvent: vi.fn()
  });

  const running = connection.start();
  await vi.waitFor(() => expect(after).toEqual([3, 7]));
  expect(onCursorExpired).toHaveBeenCalledWith(3);
  expect(connection.after).toBe(7);
  connection.stop();
  await running;
});
