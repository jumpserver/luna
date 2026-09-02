import { expect, it, vi } from "vitest";
import { AgentSseConnection, AgentStreamHttpError, createAgentSseParser } from "#koko/composables/agent/agentSse";

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
        throw new AgentStreamHttpError(409, '{"error":{"code":"cursor_expired"}}');
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
