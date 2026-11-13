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
import { installAgentSessionHarness } from "#koko/tests/agent/sessionHarness";
import {
  connectKokoFileAiSession,
  disconnectKokoFileAiSession,
  handleKokoFileAiWireMessage,
  isKokoFileAiAvailable,
  registerKokoFileAiSession,
  submitKokoFileAiPrompt,
  unregisterKokoFileAiSession
} from "#koko/composables/sftp/useFileAiSessions";
import { setWorkspaceAiEnabled } from "~/shared/aiAvailability";
import {
  registerChenSqlAiSession,
  handleChenSqlAiWireMessage,
  unregisterChenSqlAiSession
} from "~/chen/composables/useChenSqlAiSessions";
import {
  registerScriptAiSession,
  rejectScriptAiProposal,
  submitScriptAiPrompt,
  unregisterScriptAiSession
} from "~/composables/useScriptAiSessions";
import type { AgentSessionController, AgentSessionOptions } from "#koko/composables/agent/useAgentSession";
import type { AgentEvent, AgentMcpManifest } from "#koko/composables/agent/types";
import { localCodexSettings, localCodexRevision } from "~/composables/useLocalCodex";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Set<(value: { payload: AgentEvent }) => void>(),
  stop: vi.fn(),
  desktop: true,
  store: {} as any
}));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => native.store }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => native.desktop }));
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
const cleanups: Array<() => void> = [];
beforeEach(() => {
  seq = 0;
  native.desktop = true;
  setWorkspaceAiEnabled(true);
  native.store = reactive({ loggedIn: true, currentSite: "site-a", currentAccountId: "user-a", orgId: "org-a" });
  native.invoke.mockReset();
  native.stop.mockClear();
  native.listeners.clear();
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS };
  native.invoke.mockImplementation(async (command, args) => {
    structuredClone(args);
    if (command === "local_codex_create")
      return {
        session_id: "native-session",
        after: 0,
        registration_ids: Object.fromEntries(
          args.input.manifest.tools.map((tool: { name: string }) => [tool.name, "registered"])
        )
      };
    if (command === "local_codex_history") return { events: [], next_cursor: 0, has_more: false };
    if (command === "local_codex_send") return { message_id: args.message.message_id, run_id: "native-run", cursor: 0 };
  });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
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
it.each([
  ["file", "read_file"],
  ["sql", "read_sql_context"],
  ["script", "read_script"]
] as const)("routes the %s assistant and its tool results through local AI without Kael", async (domain, toolName) => {
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
  const server = vi.spyOn(agentClient, "createSession");
  const resourceSessionId = `${domain}-current`;
  const tools = [{ name: toolName, inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }];
  const sendFrame = vi.fn();
  const messages = vi.fn();
  const controller = useAgentSession({
    domain,
    relay: new AgentToolRelay({ resourceSessionId: () => resourceSessionId, sendFrame }),
    messageMetadata: () => ({ domain }),
    onAvailability: vi.fn(),
    onMessage: messages
  });
  controllers.push(controller);
  await controller.actions.attachManifest({ profile: domain, resourceSessionId, revision: 1, tools });
  await vi.waitFor(() => expect(controller.state.status).toBe("connected"));
  expect(native.invoke).toHaveBeenCalledWith(
    "local_codex_create",
    expect.objectContaining({
      input: expect.objectContaining({ manifest: expect.objectContaining({ profile: domain }) })
    })
  );
  await controller.actions.sendMessage({
    id: `message-${domain}`,
    role: "user",
    parts: [{ type: "text", text: "Inspect current context" }]
  });
  emit("run.started", {}, { resource_session_id: resourceSessionId });
  emit(
    "tool.call",
    { tool_name: toolName, arguments: {}, definition_version: 1 },
    { resource_session_id: resourceSessionId, tool_call_id: "domain-call" }
  );
  expect(sendFrame).toHaveBeenCalledOnce();
  const frame = sendFrame.mock.calls[0]![0];
  expect(frame.data.params.name).toBe(toolName);
  await controller.actions.receiveKokoFrame({
    type: "mcp.response",
    version: 1,
    resource_session_id: resourceSessionId,
    data: { jsonrpc: "2.0", id: frame.data.id, result: { structuredContent: { revision: 1 } } }
  });
  expect(native.invoke).toHaveBeenCalledWith(
    "local_codex_result",
    expect.objectContaining({
      resourceSessionId,
      result: expect.objectContaining({ result: { revision: 1 }, done: true })
    })
  );
  emit("run.completed", {}, { resource_session_id: resourceSessionId });
  expect(controller.state.activeRunId).toBe("");
  expect(server).not.toHaveBeenCalled();
});

it.each(["workspace", "terminal", "file", "sql", "script"] as const)(
  "requires enterprise enablement and stops the local %s assistant when it is disabled",
  async (domain) => {
    setWorkspaceAiEnabled(false);
    localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
    const resourceSessionId = `${domain}-policy`;
    const controller = useAgentSession({
      domain,
      relay: new AgentToolRelay({ resourceSessionId: () => resourceSessionId, sendFrame: vi.fn() }),
      messageMetadata: () => ({ domain }),
      onAvailability: vi.fn(),
      onMessage: vi.fn()
    });
    controllers.push(controller);
    await controller.actions.attachManifest({ profile: domain, resourceSessionId, revision: 1, tools: [] });
    expect(controller.state.available).toBe(false);
    expect(native.invoke).not.toHaveBeenCalled();
    setWorkspaceAiEnabled(true);
    await vi.waitFor(() => expect(controller.state.available).toBe(true));
    await controller.actions.sendMessage({
      id: "policy-message",
      role: "user",
      parts: [{ type: "text", text: "Inspect" }]
    });
    emit("run.started", {}, { resource_session_id: resourceSessionId });
    setWorkspaceAiEnabled(false);
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith("local_codex_cancel", expect.any(Object)));
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledWith("local_codex_delete", expect.any(Object)));
    expect(controller.state.available).toBe(false);
    expect(controller.state.activeRunId).toBe("");
    expect(native.listeners.size).toBe(0);
    expect(localCodexSettings.value.enabled).toBe(true);
    await expect(
      controller.actions.sendMessage({ id: "disabled", role: "user", parts: [{ type: "text", text: "Inspect" }] })
    ).rejects.toThrow();
    setWorkspaceAiEnabled(true);
    await vi.waitFor(() => expect(controller.state.available).toBe(true));
    expect(native.invoke.mock.calls.filter(([command]) => command === "local_codex_create")).toHaveLength(2);
  }
);

it.each(["file", "sql", "script"] as const)(
  "keeps the %s assistant on Kael in Web and when local AI is disabled",
  async (domain) => {
    const harness = installAgentSessionHarness();
    for (const desktop of [false, true]) {
      native.desktop = desktop;
      localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: !desktop };
      const resourceSessionId = `${domain}-${desktop}`;
      const controller = useAgentSession({
        domain,
        relay: new AgentToolRelay({ resourceSessionId: () => resourceSessionId, sendFrame: vi.fn() }),
        messageMetadata: () => ({ domain }),
        onAvailability: vi.fn(),
        onMessage: vi.fn()
      });
      controllers.push(controller);
      const manifest = { profile: domain, resourceSessionId, revision: 1, tools: [] };
      await controller.actions.attachManifest(manifest);
      await vi.waitFor(() => expect(controller.state.status).toBe("connected"));
      expect(harness.createSession).toHaveBeenCalledWith(
        manifest,
        expect.any(String),
        expect.objectContaining({ onExpired: expect.any(Function) })
      );
    }
    expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_create")).toBe(false);
  }
);

it("local File AI attaches after SFTP initialization and reconnects without losing its draft", async () => {
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
  const targetId = "local-file-reconnect";
  const context = {
    targetId,
    assetId: "asset",
    assetName: "File server",
    currentPath: "/",
    selectedEntries: [],
    connected: false
  };
  const sendFrame = vi.fn();
  cleanups.push(() => unregisterKokoFileAiSession(targetId));
  for (let attempt = 1; attempt <= 2; attempt++) {
    const socket = { readyState: WebSocket.OPEN, send: sendFrame } as unknown as WebSocket;
    const session = registerKokoFileAiSession(targetId, socket, { ...context })!;
    disconnectKokoFileAiSession(targetId, socket);
    handleKokoFileAiWireMessage(targetId, {
      type: "mcp.manifest",
      version: 1,
      resource_session_id: `file-${attempt}`,
      data: {
        profile: "file",
        revision: 1,
        tools: [{ name: "read_text", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }]
      }
    });
    await vi.waitFor(() => expect(session.agent.state.available).toBe(true));
    expect(isKokoFileAiAvailable(targetId)).toBe(false);
    connectKokoFileAiSession(targetId, socket);
    expect(isKokoFileAiAvailable(targetId)).toBe(true);
    if (attempt === 1) session.draft = "Continue after reconnect";
    else expect(session.draft).toBe("Continue after reconnect");
  }
  localCodexRevision.value++;
  await vi.waitFor(() =>
    expect(native.invoke.mock.calls.filter(([command]) => command === "local_codex_create")).toHaveLength(3)
  );
  await vi.waitFor(() => expect(isKokoFileAiAvailable(targetId)).toBe(true));
  const prompt = submitKokoFileAiPrompt(targetId, "List the current directory");
  void prompt.catch(() => {});
  await vi.waitFor(() =>
    expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_send")).toBe(true)
  );
  emit("run.started", {}, { resource_session_id: "file-2" });
  emit(
    "tool.call",
    { tool_name: "read_text", arguments: { path: "/readme.txt" }, definition_version: 1 },
    { resource_session_id: "file-2", tool_call_id: "read-file" }
  );
  const request = JSON.parse(sendFrame.mock.calls[0]![0]);
  expect(request.data).toBeTypeOf("string");
  const rpc = JSON.parse(request.data);
  expect(rpc.params).toMatchObject({ name: "read_text", arguments: { path: "/readme.txt" } });
  handleKokoFileAiWireMessage(targetId, {
    type: "mcp.response",
    version: 1,
    resource_session_id: "file-2",
    data: { jsonrpc: "2.0", id: rpc.id, result: { structuredContent: { text: "File contents" } } }
  });
  await vi.waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "local_codex_result",
      expect.objectContaining({ toolCallId: "read-file" })
    )
  );
  emit("run.completed", {}, { resource_session_id: "file-2" });
  await prompt;
});

it("local SQL keeps metadata consent and holds the proposal result until the editor applies it", async () => {
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
  const paneId = "local-sql-proposal";
  const context = {
    dialect: "postgresql",
    database: "app",
    schema: "public",
    nodeKey: "node",
    consoleId: "console",
    paneId,
    tabId: "tab",
    workspaceTabId: "query",
    workspaceTabKind: "query" as const,
    currentContext: "context",
    revision: 1,
    selectionFrom: 0,
    selectionTo: 0,
    selectedSql: "",
    documentSql: "SELECT 1"
  };
  const sendFrame = vi.fn((_frame: { data: string }) => true);
  const apply = vi.fn(() => ({ applied: true }));
  const session = registerChenSqlAiSession(paneId, sendFrame, () => context, apply)!;
  cleanups.push(() => unregisterChenSqlAiSession(paneId));
  const resourceSessionId = "local-sql-resource";
  handleChenSqlAiWireMessage(paneId, {
    type: "mcp.manifest",
    version: 1,
    resource_session_id: resourceSessionId,
    data: {
      profile: "sql",
      revision: 1,
      tools: ["inspect_schema", "propose_sql"].map((name) => ({
        name,
        inputSchema: { type: "object" },
        annotations: { readOnlyHint: true }
      }))
    }
  });
  await vi.waitFor(() => expect(session.agent.state.status).toBe("connected"));
  const pending = session.request("generate", "Prepare a query");
  void pending.catch(() => {});
  await vi.waitFor(() =>
    expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_send")).toBe(true)
  );
  emit("run.started", {}, { resource_session_id: resourceSessionId });
  emit(
    "approval.requested",
    { tool_name: "inspect_schema", arguments: { tables: ["items"] }, digest: "schema-digest" },
    { resource_session_id: resourceSessionId, approval_id: "schema-approval", tool_call_id: "schema-call" }
  );
  expect(session.metadataApproval?.tables).toEqual(["items"]);
  expect(sendFrame).not.toHaveBeenCalled();
  session.resolveMetadataApproval("approve_once");
  await vi.waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "local_codex_approve",
      expect.objectContaining({ approvalId: "schema-approval", decision: "approve" })
    )
  );
  emit(
    "approval.resolved",
    { state: "approved" },
    { resource_session_id: resourceSessionId, approval_id: "schema-approval", tool_call_id: "schema-call" }
  );
  expect(session.metadataApproval).toBeNull();
  emit(
    "tool.call",
    { tool_name: "propose_sql", arguments: { sql: "SELECT 2", explanation: "Updated query" }, definition_version: 1 },
    { resource_session_id: resourceSessionId, tool_call_id: "sql-proposal" }
  );
  const request = JSON.parse(sendFrame.mock.calls[0]![0].data);
  handleChenSqlAiWireMessage(paneId, {
    type: "mcp.response",
    version: 1,
    resource_session_id: resourceSessionId,
    data: {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        structuredContent: { kind: "proposal", proposal: { sql: "SELECT 2", base: { ...context, target: "document" } } }
      }
    }
  });
  expect(session.pendingProposalCalls.has("sql-proposal")).toBe(true);
  expect(apply).not.toHaveBeenCalled();
  expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_result")).toBe(false);
  expect(session.applyProposal("sql-proposal")).toEqual({ applied: true });
  await vi.waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "local_codex_result",
      expect.objectContaining({
        toolCallId: "sql-proposal",
        result: expect.objectContaining({ result: { proposal_id: "sql-proposal", status: "applied" } })
      })
    )
  );
  expect(apply).toHaveBeenCalledOnce();
  emit("run.completed", {}, { resource_session_id: resourceSessionId });
  await pending;
});

it("local script proposals wait for the user's rejection and never apply the draft automatically", async () => {
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS, enabled: true };
  const paneId = "local-script-proposal";
  const apply = vi.fn(() => ({ applied: true }));
  const session = registerScriptAiSession(
    paneId,
    () => ({
      paneId,
      scriptId: "script",
      name: "Script",
      content: "",
      module: "shell",
      comment: "",
      scope: "private",
      variables: [],
      revision: 1
    }),
    apply
  )!;
  cleanups.push(() => unregisterScriptAiSession(paneId));
  await vi.waitFor(() => expect(session.agent.state.status).toBe("connected"));
  const resourceSessionId = session.resourceSessionId;
  const pending = submitScriptAiPrompt(paneId, "Prepare a script draft");
  void pending.catch(() => {});
  await vi.waitFor(() =>
    expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_send")).toBe(true)
  );
  emit("run.started", {}, { resource_session_id: resourceSessionId });
  emit(
    "tool.call",
    {
      tool_name: "propose_script",
      arguments: {
        expected_revision: 1,
        content: "uptime",
        name: "Script",
        module: "shell",
        comment: "",
        summary: "Inspect uptime",
        risk_level: 1,
        risks: []
      },
      definition_version: 1
    },
    { resource_session_id: resourceSessionId, tool_call_id: "script-proposal" }
  );
  expect(session.proposals.has("script-proposal")).toBe(true);
  expect(apply).not.toHaveBeenCalled();
  expect(native.invoke.mock.calls.some(([command]) => command === "local_codex_result")).toBe(false);
  expect(rejectScriptAiProposal(paneId, "script-proposal")).toBe(true);
  await vi.waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith(
      "local_codex_result",
      expect.objectContaining({
        toolCallId: "script-proposal",
        result: expect.objectContaining({ result: { proposal_id: "script-proposal", status: "rejected" } })
      })
    )
  );
  expect(apply).not.toHaveBeenCalled();
  emit("run.completed", {}, { resource_session_id: resourceSessionId });
  await pending;
});

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
