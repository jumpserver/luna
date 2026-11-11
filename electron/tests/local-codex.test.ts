import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalCodexService, validateCodexSettings } from "../src/codex/service";
import type { AgentEvent, AgentMcpManifest } from "../../ui/koko/composables/agent/types";

async function runtime(t: test.TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-test-"));
  const events: Array<{ ownerId: number; event: AgentEvent }> = [];
  const writes: any[] = [];
  const owners = new Map([
    [1, "org-a"],
    [2, "org-a"]
  ]);
  let receive!: (message: any) => void;
  let launches = 0;
  let closed = 0;
  let thread = 0;
  let turn = 0;
  const turns = new Map<string, string>();
  const service = new LocalCodexService({
    directory,
    assertOwner(owner, org) {
      assert.equal(owners.get(owner), org, "stale owner");
    },
    emit(ownerId, event) {
      events.push({ ownerId, event });
    },
    async launch(_settings, onMessage) {
      launches++;
      receive = onMessage;
      return {
        async write(message: any) {
          writes.push(message);
          if (message.method === "initialize") queueMicrotask(() => receive({ id: message.id, result: {} }));
          else if (message.method === "thread/start") {
            const id = `thread-${++thread}`;
            queueMicrotask(() => receive({ id: message.id, result: { thread: { id } } }));
          } else if (message.method === "turn/start")
            queueMicrotask(() => {
              const turnId = `turn-${++turn}`;
              turns.set(message.params.threadId, turnId);
              receive({
                method: "turn/started",
                params: { threadId: message.params.threadId, turn: { id: turnId } }
              });
              receive({ id: message.id, result: { turn: { id: turnId } } });
            });
          else if (message.id && message.method) queueMicrotask(() => receive({ id: message.id, result: {} }));
        },
        close() {
          closed++;
        }
      };
    }
  });
  t.after(async () => {
    service.close();
    await rm(directory, { recursive: true, force: true });
  });
  await service.configure({ enabled: true, executable: "codex", model: "" });
  const manifest: AgentMcpManifest = {
    profile: "workspace",
    resourceSessionId: "workspace-test",
    revision: 3,
    tools: [
      { name: "get_workspace_state", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
      { name: "navigate_workspace", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } }
    ]
  };
  const create = async (owner = 1, profile: "workspace" | "terminal" = "workspace") => {
    const created = await service.create(owner, "org-a", {
      manifest: { ...manifest, profile, resourceSessionId: `${profile}-${owner}-${thread}` },
      approvalMode: "auto"
    });
    return {
      sessionId: created.session_id,
      resourceSessionId: `${profile}-${owner}-${thread - 1}`,
      threadId: `thread-${thread}`,
      registrations: created.registration_ids
    };
  };
  const send = (session: { sessionId: string; resourceSessionId: string }, owner = 1, id = "message-1") =>
    service.send(owner, "org-a", {
      ...session,
      message: {
        role: "user",
        message_id: id,
        idempotency_key: id,
        parts: [{ type: "text", text: "Inspect the current workspace" }]
      }
    });
  const call = (threadId: string, tool = "get_workspace_state", id = "rpc-1", args: Record<string, unknown> = {}) =>
    receive({
      id,
      method: "item/tool/call",
      params: { threadId, turnId: turns.get(threadId), callId: id, tool, arguments: args }
    });
  return {
    service,
    events,
    writes,
    owners,
    create,
    send,
    call,
    receive: (message: any) => receive(message),
    counts: () => ({ launches, closed })
  };
}

test("native threads reuse one process and round-trip only registered workspace tools", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  const run = await r.send(session);
  const terminal = await r.create(1, "terminal");
  await r.send(terminal);
  assert.equal(r.counts().launches, 1);
  const started = r.writes.find((write) => write.method === "thread/start");
  assert.equal(started.params.sandbox, "read-only");
  assert.equal(started.params.ephemeral, true);
  assert.equal(started.params.dynamicTools.length, 2);
  r.call(session.threadId);
  const event = r.events.find((item) => item.event.type === "tool.call")!.event;
  assert.equal(event.session_id, session.sessionId);
  assert.equal(event.payload!.registration_id, session.registrations.get_workspace_state);
  assert.ok(event.payload!.invocation_id);
  await r.service.result(1, "org-a", {
    ...session,
    toolCallId: event.tool_call_id,
    result: {
      jsonrpc: "2.0",
      id: event.tool_call_id!,
      run_id: run.run_id,
      seq: 0,
      done: true,
      status: "success",
      result: { tabs: [] }
    }
  });
  const response = r.writes.find((write) => write.id === "rpc-1" && write.result);
  assert.equal(response.result.success, true);
  assert.deepEqual(JSON.parse(response.result.contentItems[0].text).result, { tabs: [] });
  r.receive({
    method: "item/agentMessage/delta",
    params: { threadId: session.threadId, itemId: "answer", delta: "Ready" }
  });
  r.receive({
    method: "turn/completed",
    params: { threadId: session.threadId, turn: { id: "turn-1", status: "completed" } }
  });
  assert.ok(r.events.some((item) => item.event.type === "message.delta" && item.event.payload?.delta === "Ready"));
  assert.ok(r.events.some((item) => item.event.type === "run.completed"));
  const active = r.events.filter(
    (item) => item.event.session_id === terminal.sessionId && item.event.type.startsWith("run.")
  );
  assert.equal(active.at(-1)!.event.type, "run.started");
});

test("write approval is bound to the owning window and cannot be disabled", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  await r.send(session);
  r.call(session.threadId, "navigate_workspace", "write", { target: "asset", id: "asset-1" });
  const approval = r.events.find((item) => item.event.type === "approval.requested")!.event;
  assert.ok(!r.events.some((item) => item.event.type === "tool.call"));
  await assert.rejects(
    r.service.approve(2, "org-a", { ...session, approvalId: approval.approval_id, decision: "approve" })
  );
  assert.throws(() => r.service.mode(1, "org-a", { ...session, mode: "never" as any }));
  await r.service.approve(1, "org-a", { ...session, approvalId: approval.approval_id, decision: "approve" });
  assert.equal(r.events.filter((item) => item.event.type === "tool.call").length, 1);
  await assert.rejects(
    r.service.approve(1, "org-a", { ...session, approvalId: approval.approval_id, decision: "approve" })
  );
  r.call(session.threadId, "arbitrary_ipc", "forbidden");
  assert.equal(r.writes.find((item) => item.id === "forbidden" && item.result).result.success, false);
});

test("organization and resource changes reject callbacks and receipts", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  await r.send(session);
  await assert.rejects(r.send({ ...session, resourceSessionId: "other-resource" }, 1, "other"));
  r.owners.set(1, "org-b");
  r.call(session.threadId);
  assert.ok(!r.events.some((item) => item.event.type === "tool.call"));
  await assert.rejects(r.send(session, 1, "other"));
  assert.equal(r.writes.find((item) => item.id === "rpc-1" && item.result).result.success, false);
});

test("cancel stops the original turn and discards late results without replaying tools", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  const run = await r.send(session);
  r.call(session.threadId);
  const call = r.events.find((item) => item.event.type === "tool.call")!.event;
  await r.service.cancel(1, "org-a", session);
  assert.ok(r.writes.some((item) => item.method === "turn/interrupt" && item.params.threadId === session.threadId));
  assert.ok(
    r.events.some((item) => item.event.type === "tool.cancel" && item.event.tool_call_id === call.tool_call_id)
  );
  await r.service.result(1, "org-a", {
    ...session,
    toolCallId: call.tool_call_id,
    result: {
      jsonrpc: "2.0",
      id: call.tool_call_id!,
      run_id: run.run_id,
      seq: 0,
      done: true,
      status: "success",
      result: {}
    }
  });
  assert.equal(r.events.filter((item) => item.event.type === "tool.call").length, 1);
});

test("messages are idempotent and configuration changes dispose native sessions", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  const first = await r.send(session);
  const second = await r.send(session);
  assert.equal(second.run_id, first.run_id);
  assert.equal(second.duplicate, true);
  assert.equal(r.writes.filter((item) => item.method === "turn/start").length, 1);
  r.call(session.threadId, "navigate_workspace");
  await r.service.configure({ enabled: false, executable: "codex", model: "" });
  assert.equal(r.counts().closed, 1);
  assert.ok(
    r.events.some((item) => item.event.type === "approval.resolved" && item.event.payload?.state === "cancelled")
  );
  await assert.rejects(r.send(session));
});

test("settings reject shell arguments and unsupported domains never start a process", async (t) => {
  const r = await runtime(t);
  assert.throws(() =>
    validateCodexSettings({ enabled: true, executable: "codex --dangerously-bypass-approvals-and-sandbox", model: "" })
  );
  await assert.rejects(
    r.service.create(1, "org-a", {
      manifest: { profile: "sql", resourceSessionId: "sql", revision: 1, tools: [] },
      approvalMode: "auto"
    })
  );
  assert.equal(r.counts().launches, 0);
});

test("tool receipts acknowledge duplicate deliveries without forwarding another native reply", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  const run = await r.send(session);
  r.call(session.threadId);
  const event = r.events.find((item) => item.event.type === "tool.call")!.event;
  const result = {
    jsonrpc: "2.0" as const,
    id: event.tool_call_id!,
    run_id: run.run_id,
    seq: 0,
    done: true,
    status: "success" as const,
    result: { tabs: [] }
  };
  await r.service.result(1, "org-a", { ...session, toolCallId: event.tool_call_id, result });
  await r.service.result(1, "org-a", { ...session, toolCallId: event.tool_call_id, result });
  assert.equal(r.writes.filter((item) => item.id === "rpc-1" && item.result).length, 1);
  await assert.rejects(
    r.service.result(1, "org-a", {
      ...session,
      toolCallId: event.tool_call_id,
      result: { ...result, result: { changed: true } }
    })
  );
});

test("saving unchanged settings preserves threads; deletion after a reset is idempotent", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  await r.service.configure({ enabled: true, executable: "codex", model: "" });
  assert.equal(r.counts().closed, 0);
  await r.service.configure({ enabled: false, executable: "codex", model: "" });
  await r.service.delete(1, "org-a", session);
  await r.service.cancel(1, "org-a", session);
  assert.equal(r.counts().closed, 1);
});

test("late notifications and duplicated native requests cannot affect a subsequent turn", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  await r.send(session);
  r.call(session.threadId);
  r.call(session.threadId);
  assert.equal(r.events.filter((item) => item.event.type === "tool.call").length, 1);
  await r.service.cancel(1, "org-a", session);
  const next = await r.send(session, 1, "next-message");
  r.receive({
    method: "turn/completed",
    params: { threadId: session.threadId, turn: { id: "turn-1", status: "completed" } }
  });
  assert.ok(!r.events.some((item) => item.event.run_id === next.run_id && item.event.type === "run.completed"));
  r.receive({
    method: "turn/completed",
    params: { threadId: session.threadId, turn: { id: "turn-2", status: "completed" } }
  });
  assert.ok(r.events.some((item) => item.event.run_id === next.run_id && item.event.type === "run.completed"));
});

test("closing one window interrupts its native turn and leaves another window usable", async (t) => {
  const r = await runtime(t);
  const first = await r.create(1);
  const second = await r.create(2);
  await r.send(first, 1);
  await r.send(second, 2);
  r.service.closeOwner(1);
  assert.ok(r.writes.some((item) => item.method === "turn/interrupt" && item.params.threadId === first.threadId));
  assert.equal(r.counts().closed, 0);
  r.call(second.threadId);
  assert.ok(r.events.some((item) => item.ownerId === 2 && item.event.type === "tool.call"));
});

test("oversized merged context is rejected before a run starts and does not block the next message", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  r.service.context(1, "org-a", { ...session, context: { previous: "x".repeat(300000) } });
  await assert.rejects(
    r.service.send(1, "org-a", {
      ...session,
      message: {
        role: "user",
        message_id: "large",
        idempotency_key: "large",
        parts: [{ type: "text", text: "Inspect" }],
        metadata: { context: { current: "y".repeat(300000) } }
      }
    }),
    /size limit/
  );
  assert.ok(!r.events.some((item) => item.event.type === "run.started"));
  await r.send(session);
  assert.equal(r.writes.filter((item) => item.method === "turn/start").length, 1);
});

test("database metadata still requires consent when the tool advertises read-only access", async (t) => {
  const r = await runtime(t);
  const created = await r.service.create(1, "org-a", {
    manifest: {
      profile: "terminal",
      resourceSessionId: "database-terminal",
      revision: 1,
      tools: [{ name: "database_schema", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }]
    },
    approvalMode: "auto"
  });
  const session = { sessionId: created.session_id, resourceSessionId: "database-terminal" };
  await r.send(session);
  r.call("thread-1", "database_schema");
  assert.ok(r.events.some((item) => item.event.type === "approval.requested"));
  assert.ok(!r.events.some((item) => item.event.type === "tool.call"));
});
