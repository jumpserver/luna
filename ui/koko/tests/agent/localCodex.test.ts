import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, reactive } from "vue";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import { agentClient } from "#koko/composables/agent/agentClient";
import {
  LocalCodexClient,
  LocalCodexConnection,
  useDesktopCodexSession
} from "#koko/composables/agent/localCodexClient";
import { useAgentSession } from "#koko/composables/agent/useAgentSession";
import type { AgentSessionController, AgentSessionOptions } from "#koko/composables/agent/useAgentSession";
import type { AgentEvent, AgentMcpManifest } from "#koko/composables/agent/types";
import { localCodexSettings, localCodexRevision } from "~/composables/useLocalCodex";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Set<(value: { payload: AgentEvent }) => void>(),
  stop: vi.fn(),
  store: {} as any
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => native.store }));
vi.mock("~/shared/desktop/bridge", () => ({
  desktopInvoke: native.invoke,
  desktopListen: async (_name: string, handler: (event: any) => void) => {
    native.listeners.add(handler);
    return () => {
      native.listeners.delete(handler);
      native.stop();
    };
  }
}));
const manifest: AgentMcpManifest = {
  profile: "workspace",
  resourceSessionId: "workspace-current",
  revision: 3,
  tools: [{ name: "get_workspace_state", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }]
};
let seq = 0;
const controllers: AgentSessionController[] = [];
beforeEach(() => {
  seq = 0;
  native.store = reactive({ loggedIn: true, currentSite: "site-a", currentAccountId: "user-a", orgId: "org-a" });
  native.invoke.mockReset();
  native.stop.mockClear();
  native.listeners.clear();
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS };
  native.invoke.mockImplementation(async (command, args) => {
    structuredClone(args);
    if (command === "local_codex_create")
      return { session_id: "native-session", after: 0, registration_ids: { get_workspace_state: "registered" } };
    if (command === "local_codex_history") return { events: [], next_cursor: 0, has_more: false };
    if (command === "local_codex_send") return { message_id: args.message.message_id, run_id: "native-run", cursor: 0 };
  });
});
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.actions.dispose();
  vi.restoreAllMocks();
});
function emit(type: AgentEvent["type"], payload = {}, extra: Partial<AgentEvent> = {}) {
  const event: AgentEvent = {
    seq: ++seq,
    type,
    session_id: "native-session",
    resource_session_id: manifest.resourceSessionId,
    run_id: "native-run",
    payload,
    ...extra
  };
  for (const handler of native.listeners) handler({ payload: event });
}
it("reuses the existing controller and relay over IPC without calling Kael", async () => {
  const server = vi.spyOn(agentClient, "createSession");
  const sendFrame = vi.fn();
  const messages = vi.fn();
  const client = new LocalCodexClient();
  const relay = new AgentToolRelay({
    resourceSessionId: () => manifest.resourceSessionId,
    revision: () => 3,
    includeRegistrationBinding: true,
    sendFrame
  });
  const controller = useAgentSession({
    domain: "workspace",
    enabled: computed(() => true),
    relay,
    client,
    createSse: (options) => new LocalCodexConnection(options, client),
    messageMetadata: () => ({ domain: "workspace" }),
    onAvailability: vi.fn(),
    onMessage: messages
  });
  controllers.push(controller);
  await controller.actions.attachManifest(reactive(manifest));
  await vi.waitFor(() => expect(controller.state.status).toBe("connected"));
  emit("run.started");
  emit(
    "tool.call",
    {
      id: "call-1",
      tool_name: "get_workspace_state",
      arguments: {},
      definition_version: 3,
      registration_id: "registered",
      invocation_id: "invocation-1"
    },
    { tool_call_id: "call-1" }
  );
  expect(sendFrame).toHaveBeenCalledOnce();
  expect(sendFrame.mock.calls[0]![0].data.params._meta["com.jumpserver/agent"]).toMatchObject({
    resource_session_id: manifest.resourceSessionId,
    registration_id: "registered",
    invocation_id: "invocation-1"
  });
  await controller.actions.receiveKokoFrame({
    type: "mcp.response",
    version: 1,
    resource_session_id: manifest.resourceSessionId,
    data: { jsonrpc: "2.0", id: "call-1", result: { tabs: [] } }
  });
  expect(native.invoke).toHaveBeenCalledWith(
    "local_codex_result",
    expect.objectContaining({
      sessionId: "native-session",
      resourceSessionId: manifest.resourceSessionId,
      toolCallId: "call-1",
      result: expect.objectContaining({ done: true, run_id: "native-run" })
    })
  );
  emit("message.delta", { delta: "Ready" }, { message_id: "answer" });
  emit(
    "approval.requested",
    { tool_name: "navigate_workspace", arguments: { target: "asset" }, digest: "approval-1" },
    { approval_id: "approval-1", tool_call_id: "call-2" }
  );
  await controller.actions.resolveApproval("approval-1", "approve");
  expect(native.invoke).toHaveBeenCalledWith(
    "local_codex_approve",
    expect.objectContaining({ approvalId: "approval-1", decision: "approve" })
  );
  await controller.actions.cancel();
  expect(native.invoke).toHaveBeenCalledWith(
    "local_codex_cancel",
    expect.objectContaining({ sessionId: "native-session" })
  );
  expect(
    messages.mock.calls.some(([message]) =>
      message.parts.some((part: any) => part.type === "text" && part.text === "Ready")
    )
  ).toBe(true);
  expect(server).not.toHaveBeenCalled();
});
it("merges events received during catch-up once and filters other sessions", async () => {
  let finish!: (value: unknown) => void;
  native.invoke.mockImplementation((command) =>
    command === "local_codex_history"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : undefined
  );
  const events = vi.fn();
  const client = new LocalCodexClient();
  const connection = new LocalCodexConnection(
    { sessionId: "native-session", resourceSessionId: manifest.resourceSessionId, onEvent: events },
    client
  );
  const started = connection.start();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  emit("message.delta", { delta: "one" });
  emit("message.delta", { delta: "foreign" }, { session_id: "another-session" });
  finish({
    events: [
      {
        seq: 1,
        type: "message.delta",
        session_id: "native-session",
        resource_session_id: manifest.resourceSessionId,
        payload: { delta: "one" }
      }
    ],
    has_more: false
  });
  await started;
  expect(events).toHaveBeenCalledOnce();
  connection.stop();
  expect(native.listeners.size).toBe(0);
});
it("catches up beyond the former event and page limits without buffering or cancelling the turn", async () => {
  let finish!: (value: unknown) => void;
  let late = false;
  const page = (after: number) => {
    const head = seq;
    const end = Math.min(after + 128, head);
    const events = Array.from(
      { length: end - after },
      (_, index): AgentEvent => ({
        seq: after + index + 1,
        type: "message.delta",
        session_id: "native-session",
        resource_session_id: manifest.resourceSessionId,
        payload: { delta: String(after + index + 1) }
      })
    );
    if (end === head && !late) {
      late = true;
      emit("message.delta", { delta: String(seq + 1) });
    }
    return { events, next_cursor: end, has_more: end < head };
  };
  native.invoke.mockImplementation((command, args) => {
    if (command !== "local_codex_history") return undefined;
    if (!finish)
      return new Promise((resolve) => {
        finish = resolve;
      });
    return page(args.after);
  });
  const events = vi.fn();
  const unavailable = vi.fn();
  const connection = new LocalCodexConnection({
    sessionId: "native-session",
    resourceSessionId: manifest.resourceSessionId,
    onEvent: events,
    onUnavailable: unavailable
  });
  const started = connection.start();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  for (let index = 0; index < 4500; index++) emit("message.delta", { delta: String(seq + 1) });
  finish(page(0));
  await started;
  expect(events.mock.calls.map(([event]) => event.seq)).toEqual(Array.from({ length: 4501 }, (_, index) => index + 1));
  expect(native.invoke.mock.calls.filter(([command]) => command === "local_codex_history").length).toBeGreaterThan(32);
  expect(unavailable).not.toHaveBeenCalled();
  expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_cancel")).toBe(false);
  emit("run.completed");
  expect(events).toHaveBeenCalledTimes(4502);
  connection.stop();
  expect(native.listeners.size).toBe(0);
});

it("rejects a non-advancing replay cursor instead of polling indefinitely", async () => {
  native.invoke.mockResolvedValue({ events: [], next_cursor: 0, has_more: true });
  const unavailable = vi.fn();
  const connection = new LocalCodexConnection({
    sessionId: "native-session",
    resourceSessionId: manifest.resourceSessionId,
    onEvent: vi.fn(),
    onUnavailable: unavailable
  });
  await connection.start();
  expect(unavailable).toHaveBeenCalledWith(
    expect.objectContaining({ message: "Local Codex history cursor did not advance" })
  );
  expect(native.listeners.size).toBe(0);
});

it("changing the selected backend disposes the previous controller and rebinds its manifest", async () => {
  const created: Array<{ options: AgentSessionOptions; controller: AgentSessionController }> = [];
  const factory = (options: AgentSessionOptions): AgentSessionController => {
    const actions = {
      attachManifest: vi.fn(async () => {}),
      updateContext: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      resolveApproval: vi.fn(async () => {}),
      receiveKokoFrame: vi.fn(async () => true),
      cancel: vi.fn(async () => {}),
      newSession: vi.fn(async () => {}),
      setApprovalMode: vi.fn(async () => {}),
      dispose: vi.fn(async () => {})
    };
    const controller = { state: { status: "connected" } as any, actions };
    created.push({ options, controller });
    return controller;
  };
  const options: AgentSessionOptions = {
    domain: "workspace",
    relay: new AgentToolRelay({ resourceSessionId: () => "current", sendFrame: vi.fn() }),
    messageMetadata: () => ({}),
    onAvailability: vi.fn(),
    onMessage: vi.fn()
  };
  const controller = useDesktopCodexSession(options, factory);
  controllers.push(controller);
  await controller.actions.attachManifest(manifest);
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
  localCodexRevision.value++;
  await vi.waitFor(() => expect(created).toHaveLength(2));
  expect(created[0]!.controller.actions.dispose).toHaveBeenCalledOnce();
  expect(created[1]!.options.client).toBeInstanceOf(LocalCodexClient);
  expect(created[1]!.options.enabled!.value).toBe(true);
  native.store.orgId = "org-b";
  expect(created[1]!.options.enabled!.value).toBe(false);
  native.store.orgId = "org-a";
  expect(created[1]!.options.enabled!.value).toBe(true);
  expect(created[1]!.controller.actions.attachManifest).toHaveBeenCalledWith(manifest);
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS };
  localCodexRevision.value++;
  await vi.waitFor(() => expect(created).toHaveLength(3));
  expect(created[1]!.controller.actions.dispose).toHaveBeenCalledOnce();
  expect(created[2]!.options.client).toBeUndefined();
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, model: "unused-local-model" };
  localCodexRevision.value++;
  await Promise.resolve();
  expect(created).toHaveLength(3);
});

it("a failed local relay closes the listener and stops the owning native turn", async () => {
  const unavailable = vi.fn();
  const connection = new LocalCodexConnection({
    sessionId: "native-session",
    resourceSessionId: manifest.resourceSessionId,
    onEvent: () => {
      throw new Error("Terminal disconnected");
    },
    onUnavailable: unavailable
  });
  await connection.start();
  expect(() => emit("tool.call")).not.toThrow();
  expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ message: "Terminal disconnected" }));
  expect(native.listeners.size).toBe(0);
  expect(native.invoke).toHaveBeenCalledWith("local_codex_cancel", {
    sessionId: "native-session",
    resourceSessionId: manifest.resourceSessionId
  });
});
