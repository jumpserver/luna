import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexEventHistory } from "../src/codex/history";
import {
  codexMcpOverrides,
  codexModelConfiguration,
  LocalCodexService,
  validateCodexSettings
} from "../src/codex/service";
import { DEFAULT_CODEX_SETTINGS } from "../../ui/shared/codex/types";
import { MCP_FINAL_RESULT_META_KEY } from "../../ui/koko/composables/agent/types";
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
    secrets: {
      encrypt: (value) => Buffer.from(value).toString("base64"),
      decrypt: (value) => Buffer.from(value, "base64").toString()
    },
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
          } else if (message.method === "model/list") {
            const first = !message.params.cursor;
            queueMicrotask(() =>
              receive({
                id: message.id,
                result: {
                  data: first
                    ? [
                        {
                          id: "catalog-id",
                          model: "native-model",
                          displayName: "Native",
                          isDefault: true,
                          supportedReasoningEfforts: [
                            { reasoningEffort: "low", description: "Fast" },
                            { reasoningEffort: "high", description: "Thorough" },
                            { reasoningEffort: "future-effort", description: "New model capability" },
                            { reasoningEffort: "high", description: "Duplicate" },
                            { reasoningEffort: "" }
                          ]
                        }
                      ]
                    : [{ id: "another-model", model: "another-model" }],
                  nextCursor: first ? "next-model-page" : null
                }
              })
            );
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
  const create = async (owner = 1, profile: AgentMcpManifest["profile"] = "workspace", tools = manifest.tools) => {
    const created = await service.create(owner, "org-a", {
      manifest: { ...manifest, profile, tools, resourceSessionId: `${profile}-${owner}-${thread}` },
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

test("one native process supports more than twelve conversations and four active turns", async (t) => {
  const r = await runtime(t);
  const sessions = [];
  for (let index = 0; index < 13; index++) sessions.push(await r.create());
  for (const session of sessions) await r.send(session);
  assert.equal(r.counts().launches, 1);
  assert.equal(new Set(sessions.map((session) => session.threadId)).size, 13);
  assert.equal(r.events.filter((item) => item.event.type === "run.started").length, 13);
  await assert.rejects(r.send(sessions[0], 1, "overlapping-message"), /Wait for the active Codex turn/);
});

test("file, SQL and script sessions share the runtime and round-trip their registered tools", async (t) => {
  const r = await runtime(t);
  for (const [profile, name] of [
    ["file", "read_file"],
    ["sql", "read_sql_context"],
    ["script", "read_script"]
  ] as const) {
    const session = await r.create(1, profile, [
      { name, inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }
    ]);
    const run = await r.send(session);
    const started = r.writes.filter((write) => write.method === "thread/start").at(-1);
    assert.equal(started.params.dynamicTools[0].name, name);
    assert.ok(started.params.developerInstructions.includes(`${profile} assistant`));
    r.call(session.threadId, name, `rpc-${profile}`);
    const event = r.events.filter((item) => item.event.type === "tool.call").at(-1)!.event;
    assert.equal(event.session_id, session.sessionId);
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
        result: { revision: 1 }
      }
    });
    const reply = r.writes.find((write) => write.id === `rpc-${profile}` && write.result);
    assert.equal(reply.result.success, true);
    assert.deepEqual(JSON.parse(reply.result.contentItems[0].text).result, { revision: 1 });
  }
  assert.equal(r.counts().launches, 1);
});

for (const [profile, name] of [
  ["sql", "propose_sql"],
  ["script", "propose_script"]
] as const) {
  test(`${profile} proposal decisions prevent further tools until a new turn`, async (t) => {
    const r = await runtime(t);
    const session = await r.create(1, profile, [
      {
        name,
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true },
        _meta: { [MCP_FINAL_RESULT_META_KEY]: true }
      },
      { name: "read_context", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }
    ]);
    const run = await r.send(session);
    r.call(session.threadId, name, "proposal");
    const event = r.events.find((item) => item.event.type === "tool.call")!.event;
    assert.ok(!r.writes.some((write) => write.id === "proposal" && write.result));
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
        result: { status: "rejected" }
      }
    });
    const reply = r.writes.find((write) => write.id === "proposal" && write.result);
    assert.match(JSON.parse(reply.result.contentItems[0].text).instruction, /does not mean saved or executed/);
    r.call(session.threadId, "read_context", "after-decision");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(r.writes.find((write) => write.id === "after-decision").result.success, false);
    assert.equal(r.events.filter((item) => item.event.type === "tool.call").length, 1);
    r.receive({
      method: "turn/completed",
      params: { threadId: session.threadId, turn: { id: "turn-1", status: "completed" } }
    });
    await r.send(session, 1, "next-message");
    r.call(session.threadId, "read_context", "next-turn");
    assert.equal(r.events.filter((item) => item.event.type === "tool.call").length, 2);
  });
}

test("reasoning overrides reach workspace and terminal turns while default settings inherit Codex configuration", async (t) => {
  const r = await runtime(t);
  await r.send(await r.create());
  const inherited = r.writes.find((write) => write.method === "turn/start");
  assert.ok(!("effort" in JSON.parse(JSON.stringify(inherited.params))));
  await r.service.configure({ enabled: true, executable: "codex", model: "", reasoningEffort: "future-effort" });
  await r.send(await r.create());
  await r.send(await r.create(1, "terminal"));
  assert.deepEqual(
    r.writes
      .filter((write) => write.method === "turn/start")
      .slice(1)
      .map((write) => write.params.effort),
    ["future-effort", "future-effort"]
  );
});

test("API connections retain reasoning overrides and surface unsupported-effort failures", async (t) => {
  const r = await runtime(t);
  const settings = await r.service.configure({
    ...DEFAULT_CODEX_SETTINGS,
    enabled: true,
    runtime: "system",
    model: "service-model",
    reasoningEffort: "high",
    apiKey: "test-provider-key"
  });
  const session = await r.create();
  await r.send(session);
  assert.equal(r.writes.find((write) => write.method === "turn/start").params.effort, "high");
  const checking = r.service.testConnection(1, "org-a", settings);
  const rejected = assert.rejects(checking, /Unsupported reasoning effort: high/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(r.writes.filter((write) => write.method === "turn/start").at(-1).params.effort, "high");
  r.receive({
    method: "turn/completed",
    params: {
      threadId: "thread-2",
      turn: { id: "turn-2", status: "failed", error: { message: "Unsupported reasoning effort: high" } }
    }
  });
  await rejected;
});

test("API settings default missing reasoning effort to medium and preserve an explicit model default", async (t) => {
  const r = await runtime(t);
  const saved = await r.service.configure({
    ...DEFAULT_CODEX_SETTINGS,
    enabled: true,
    runtime: "system",
    model: "service-model",
    reasoningEffort: undefined,
    apiKey: "test-provider-key"
  });
  assert.equal(saved.reasoningEffort, "medium");
  await r.send(await r.create());
  assert.equal(r.writes.find((write) => write.method === "turn/start").params.effort, "medium");
  const inherited = await r.service.configure({ ...saved, reasoningEffort: "" });
  assert.equal(inherited.reasoningEffort, "");
  await r.send(await r.create());
  assert.equal(r.writes.filter((write) => write.method === "turn/start").at(-1).params.effort, undefined);
});

test("history pages old events after cache eviction without an event-count ceiling", (t) => {
  const history = new CodexEventHistory(1024);
  t.after(() => history.close());
  for (let seq = 1; seq <= 4200; seq++) {
    const event: AgentEvent = { seq, type: "message.delta", payload: { delta: `event-${seq}` } };
    history.append(event, JSON.stringify(event));
  }
  let cursor = 0;
  let count = 0;
  for (;;) {
    const page = history.read(cursor);
    assert.equal(page.events[0].seq, cursor + 1);
    count += page.events.length;
    cursor = page.next_cursor;
    if (!page.has_more) break;
  }
  assert.equal(count, 4200);
  assert.equal(cursor, 4200);
  assert.equal(history.read(4199).events[0].payload?.delta, "event-4200");
});

test("history pages bound response bytes and clean up session-scoped storage", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-history-cleanup-"));
  const history = new CodexEventHistory(1024, directory);
  t.after(async () => {
    history.close();
    await rm(directory, { recursive: true, force: true });
  });
  for (let seq = 1; seq <= 5; seq++) {
    const event: AgentEvent = { seq, type: "message.delta", payload: { delta: "x".repeat(200 * 1024) } };
    history.append(event, JSON.stringify(event));
  }
  const page = history.read(0);
  assert.equal(page.events.length, 2);
  assert.ok(Buffer.byteLength(JSON.stringify(page.events)) < 512 * 1024);
  assert.equal(page.next_cursor, 2);
  assert.equal(page.has_more, true);
  history.close();
  assert.throws(() => history.read(0), /history is closed/);
  assert.deepEqual(await readdir(directory), []);
});

test("evicting recent events does not interrupt the native turn or expire its replay cursor", async (t) => {
  const r = await runtime(t);
  const session = await r.create();
  const run = await r.send(session);
  for (let index = 0; index < 24; index++)
    r.receive({
      method: "item/agentMessage/delta",
      params: { threadId: session.threadId, itemId: "answer", delta: "x".repeat(200 * 1024) }
    });
  const page = r.service.history(1, "org-a", { ...session, after: 1 });
  assert.equal(page.events[0].seq, 2);
  assert.equal(page.has_more, true);
  assert.equal(r.counts().closed, 0);
  assert.ok(!r.events.some((item) => ["run.failed", "run.cancelled", "session.closed"].includes(item.event.type)));
  r.call(session.threadId);
  assert.ok(r.events.some((item) => item.event.type === "tool.call" && item.event.run_id === run.run_id));
  r.receive({
    method: "turn/completed",
    params: { threadId: session.threadId, turn: { id: "turn-1", status: "completed" } }
  });
  assert.ok(r.events.some((item) => item.event.type === "run.completed" && item.event.run_id === run.run_id));
});

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
      manifest: {
        profile: "unknown" as AgentMcpManifest["profile"],
        resourceSessionId: "unknown",
        revision: 1,
        tools: []
      },
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
  for (const [profile, name] of [
    ["terminal", "database_schema"],
    ["sql", "inspect_schema"]
  ] as const) {
    const session = await r.create(1, profile, [
      { name, inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }
    ]);
    await r.send(session);
    r.call(session.threadId, name, `metadata-${profile}`);
    assert.ok(
      r.events.some((item) => item.event.type === "approval.requested" && item.event.session_id === session.sessionId)
    );
  }
  assert.ok(!r.events.some((item) => item.event.type === "tool.call"));
});

test("legacy settings retain the user's CLI, while API credentials remain encrypted and never enter arguments", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-settings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const legacy = validateCodexSettings({ enabled: true, executable: "codex", model: "" });
  assert.equal(legacy.runtime, "system");
  assert.equal(legacy.connection, "existing");
  assert.equal(legacy.reasoningEffort, "");
  const service = new LocalCodexService({
    directory,
    assertOwner() {},
    emit() {},
    secrets: {
      encrypt: (value) => Buffer.from(value).toString("base64"),
      decrypt: (value) => Buffer.from(value, "base64").toString()
    }
  });
  const secret = "private-test-api-key";
  const input = {
    ...DEFAULT_CODEX_SETTINGS,
    runtime: "system" as const,
    model: "configured-model",
    reasoningEffort: "high",
    apiKey: secret
  };
  const saved = await service.configure(input);
  assert.equal(saved.reasoningEffort, "high");
  const restored = new LocalCodexService({ directory, assertOwner() {}, emit() {} });
  assert.equal((await restored.configuration()).reasoningEffort, "high");
  assert.equal(saved.hasApiKey, true);
  assert.ok(!JSON.stringify(saved).includes(secret));
  assert.ok(!(await readFile(path.join(directory, "settings.json"), "utf8")).includes(secret));
  const launch = codexModelConfiguration(saved, directory, secret);
  assert.equal(launch.env.LUNA_CODEX_API_KEY, secret);
  assert.equal(launch.env.OPENAI_API_KEY, undefined);
  assert.equal(launch.env.CODEX_HOME, path.join(directory, "codex-home"));
  assert.ok(!launch.overrides.join(" ").includes(secret));
  assert.equal((await service.configure({ ...saved, apiKey: "" })).hasApiKey, true);
  await assert.rejects(
    service.configure({ ...saved, enabled: true, baseUrl: "https://another-service.test/v1" }),
    /API key/
  );
  assert.equal((await service.configure({ ...saved, clearApiKey: true })).hasApiKey, false);
  assert.throws(() => validateCodexSettings({ ...input, baseUrl: "https://user:secret@model.test/v1" }));
  for (const reasoningEffort of [123, {}, "x".repeat(65), "high\nlow"])
    assert.throws(() => validateCodexSettings({ ...input, reasoningEffort }), /reasoning effort/);
});

test("connection tests use an ephemeral thread with no workspace tools and preserve the current conversation", async (t) => {
  const r = await runtime(t);
  await r.create();
  const events = r.events.length;
  const checking = r.service.testConnection(1, "org-a", {
    enabled: false,
    executable: "codex",
    model: "",
    reasoningEffort: "high"
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(r.writes.filter((item) => item.method === "thread/start").at(-1).params.dynamicTools, []);
  assert.equal(r.writes.filter((item) => item.method === "turn/start").at(-1).params.effort, "high");
  r.receive({
    method: "turn/completed",
    params: { threadId: "thread-2", turn: { id: "turn-1", status: "completed" } }
  });
  assert.deepEqual(await checking, { connected: true });
  assert.equal(r.events.length, events);
  assert.equal(r.counts().closed, 1);
});

test("provider startup errors cannot return the stored API key", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-key-error-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = "private-provider-key";
  const service = new LocalCodexService({
    directory,
    assertOwner() {},
    emit() {},
    secrets: {
      encrypt: (value) => Buffer.from(value).toString("base64"),
      decrypt: (value) => Buffer.from(value, "base64").toString()
    },
    async launch() {
      throw new Error(`Provider rejected ${secret}`);
    }
  });
  await service.configure({
    ...DEFAULT_CODEX_SETTINGS,
    enabled: true,
    runtime: "system",
    model: "configured-model",
    apiKey: secret
  });
  await assert.rejects(
    service.create(1, "org", {
      manifest: { profile: "workspace", resourceSessionId: "key-test", revision: 1, tools: [] },
      approvalMode: "always"
    }),
    (error: Error) => error.message.includes("[redacted]") && !error.message.includes(secret)
  );
});

test("MCP isolation disables complete transports without copying their credentials into arguments", () => {
  const secret = "private-mcp-credential";
  const overrides = codexMcpOverrides([
    { name: "codex_app", transport: { command: "private-server", env: { TOKEN: secret } } },
    { name: "server.with-dots", transport: { url: `https://private.test/${secret}` } }
  ]);
  assert.equal(overrides.length, 1);
  assert.ok(overrides[0].includes('"codex_app"={command="luna-disabled-mcp",enabled=false}'));
  assert.ok(overrides[0].includes('"server.with-dots"={command="luna-disabled-mcp",enabled=false}'));
  assert.ok(!overrides[0].includes(secret));
  assert.ok(!overrides[0].includes("private-server"));
});

test("connection tests preserve the original process failure while initialization is pending", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-startup-error-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const service = new LocalCodexService({
    directory,
    assertOwner() {},
    emit() {},
    async launch(_settings, _receive, failed) {
      return {
        async write(message) {
          if ((message as { method?: string }).method === "initialize")
            failed(new Error("Native Codex configuration failed"));
        },
        close() {}
      };
    }
  });
  t.after(() => service.close());
  await assert.rejects(
    service.testConnection(1, "org", { enabled: false, executable: "codex", model: "" }),
    /Native Codex configuration failed/
  );
});

test("API model discovery uses draft credentials without an installed runtime or selected model", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-models-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = "private-model-list-key";
  const service = new LocalCodexService({
    directory,
    assertOwner() {},
    emit() {},
    secrets: {
      encrypt: (value) => Buffer.from(value).toString("base64"),
      decrypt: (value) => Buffer.from(value, "base64").toString()
    },
    async fetch(url, init) {
      assert.equal(url, "https://models.test/v1/models");
      assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${key}`);
      assert.equal(init.redirect, "error");
      return Response.json({ data: [{ id: "service-model" }, { id: "service-model" }, { id: "another-model" }] });
    }
  });
  t.after(() => service.close());
  const draft = { ...DEFAULT_CODEX_SETTINGS, enabled: true, baseUrl: "https://models.test/v1/", apiKey: key };
  assert.deepEqual(await service.models(1, "org", draft), [
    { id: "service-model", name: "service-model", isDefault: false },
    { id: "another-model", name: "another-model", isDefault: false }
  ]);
  assert.equal((await service.configuration()).hasApiKey, false);
  await assert.rejects(readFile(path.join(directory, "settings.json")), { code: "ENOENT" });
});

test("model discovery does not forward a saved key to a different endpoint and redacts failures", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-codex-model-key-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = "saved-model-list-key";
  let requests = 0;
  const service = new LocalCodexService({
    directory,
    assertOwner() {},
    emit() {},
    secrets: {
      encrypt: (value) => Buffer.from(value).toString("base64"),
      decrypt: (value) => Buffer.from(value, "base64").toString()
    },
    async fetch() {
      requests++;
      throw new Error(`Request failed: ${key}`);
    }
  });
  t.after(() => service.close());
  const settings = { ...DEFAULT_CODEX_SETTINGS, baseUrl: "https://models.test/v1", apiKey: key };
  await service.configure(settings);
  await assert.rejects(
    service.models(1, "org", { ...settings, baseUrl: "https://another.test/v1", apiKey: "" }),
    /Enter an API key/
  );
  assert.equal(requests, 0);
  await assert.rejects(
    service.models(1, "org", { ...settings, apiKey: "" }),
    (error: Error) => error.message.includes("[redacted]") && !error.message.includes(key)
  );
});

test("existing configuration discovers paginated native models without creating a conversation", async (t) => {
  const r = await runtime(t);
  const settings = await r.service.configuration();
  assert.deepEqual(await r.service.models(1, "org-a", settings), [
    {
      id: "native-model",
      name: "Native",
      isDefault: true,
      supportedReasoningEfforts: ["low", "high", "future-effort"]
    },
    { id: "another-model", name: "another-model", isDefault: false }
  ]);
  assert.equal(r.writes.filter((write) => write.method === "model/list").length, 2);
  assert.equal(
    r.writes.some((write) => write.method === "thread/start"),
    false
  );
  assert.deepEqual(await r.service.configuration(), settings);
  assert.deepEqual(r.counts(), { launches: 1, closed: 1 });
  const session = await r.create();
  await r.send(session);
});
