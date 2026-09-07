import type { KokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import type { WorkspacePane } from "./useWorkspaceTabs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markRaw, nextTick, reactive, shallowReactive, shallowRef } from "vue";
import { createWorkspaceTerminalTasks, workspaceTerminalTools } from "./useWorkspaceTerminalTasks";
import { validateWorkspaceToolArguments } from "./useWorkspaceAssistantTools";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), submit: vi.fn() }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({ currentUser: null }) }));
vi.mock("~/composables/useApiRequest", () => ({ getAssetDetailRequest: vi.fn() }));
vi.mock("#koko/composables/terminal/useTerminalAiSessions", () => ({
  getKokoTerminalAiSession: mocks.lookup,
  submitKokoTerminalAiPrompt: mocks.submit
}));
const managers: ReturnType<typeof createWorkspaceTerminalTasks>[] = [];

function terminal(id: string) {
  return reactive({
    paneId: `physical-${id}`,
    connected: true,
    enabled: true,
    taskActive: false,
    inputLocked: false,
    pendingApprovals: new Set<string>(),
    metadataApproval: null,
    runtimeState: "",
    errorCode: "",
    errorText: "",
    agent: markRaw({
      state: reactive({ resourceSessionId: `resource-${id}`, agentSessionId: `agent-${id}`, available: true }),
      actions: { cancel: vi.fn().mockResolvedValue(undefined) }
    }),
    chat: markRaw({ status: shallowRef("ready"), messages: shallowRef<any[]>([]), stop: vi.fn() })
  }) as unknown as KokoTerminalAiSession;
}
function setup() {
  const pane = reactive({
    id: "pane-a",
    assetName: "host-a",
    account: "root",
    address: "10.0.0.1",
    protocol: "ssh",
    orgId: "org",
    status: "connected"
  }) as WorkspacePane;
  const panes = shallowRef([pane]);
  const session = terminal("a");
  const registry = shallowReactive(
    new Map([
      [pane.id, session],
      [session.paneId, session]
    ])
  );
  mocks.lookup.mockImplementation((id: string) => registry.get(id) || null);
  mocks.submit.mockImplementation(async (id: string, prompt: string) => {
    const current = registry.get(id)!;
    current.taskActive = true;
    current.chat.status.value = "streaming";
    current.chat.messages.value = [
      ...current.chat.messages.value,
      { id: "request", role: "user", parts: [{ type: "text", text: prompt }] }
    ];
  });
  const scope = shallowRef("auto");
  const onStart = vi.fn();
  const assertCurrent = vi.fn();
  const manager = createWorkspaceTerminalTasks({
    panes: () => panes.value,
    organizationId: "org",
    assertCurrent,
    targetScope: () => scope.value,
    onStart
  });
  managers.push(manager);
  return { manager, pane, panes, session, registry, scope, onStart, assertCurrent };
}
function complete(session: KokoTerminalAiSession, text = "Disk usage is 46%.") {
  session.chat.messages.value = [
    ...session.chat.messages.value,
    { id: "response", role: "assistant", parts: [{ type: "text", text }] }
  ];
  session.runtimeState = "completed";
  session.taskActive = false;
  session.chat.status.value = "ready";
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  managers.splice(0).forEach((manager) => manager.dispose());
  vi.useRealTimers();
});

describe("unified assistant terminal task bridge", () => {
  it("lists only terminals in the current organization and keeps bindings stable", () => {
    const { manager, panes, pane, registry } = setup();
    const other = terminal("other");
    registry.set("foreign", other);
    panes.value = [pane, { ...pane, id: "foreign", orgId: "another-org" }];
    const targets = manager.list();
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ pane_id: "pane-a", asset_name: "host-a", available: true });
    expect(manager.list()[0]?.target_id).toBe(targets[0]?.target_id);
    expect(JSON.stringify(targets)).not.toContain("resource-a");
  });

  it("dispatches to the captured physical session and reports only this task's messages", async () => {
    const { manager, session, panes, pane, onStart } = setup();
    session.chat.messages.value = [{ id: "old", role: "assistant", parts: [{ type: "text", text: "An older task" }] }];
    const target = manager.list()[0]!;
    const started = await manager.start(target.target_id, "Inspect the disk");
    expect(started).toMatchObject({ status: "running", done: false });
    expect(mocks.submit).toHaveBeenCalledWith("physical-a", "Inspect the disk");
    expect(onStart).toHaveBeenCalledWith(manager.tasks[0]);
    panes.value = [pane]; // Focusing/reordering a tab never substitutes the target.
    complete(session);
    await nextTick();
    expect(await manager.read(started.task_id, 0, new AbortController().signal)).toMatchObject({
      status: "completed",
      done: true,
      summary: "Disk usage is 46%."
    });
    expect(manager.tasks[0]?.messages.some((message) => message.id === "old")).toBe(false);
    const saved = manager.tasks[0]?.messages;
    session.chat.messages.value = [
      ...session.chat.messages.value,
      { id: "later", role: "user", parts: [{ type: "text", text: "Unrelated follow-up" }] }
    ];
    await nextTick();
    expect(manager.tasks[0]?.messages).toBe(saved);
  });

  it("rejects stale targets after reconnect and cannot send to a replacement", async () => {
    const { manager, registry } = setup();
    const target = manager.list()[0]!;
    registry.set("pane-a", terminal("replacement"));
    await expect(manager.start(target.target_id, "Inspect")).rejects.toThrow("terminal_changed");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(manager.list()[0]?.target_id).not.toBe(target.target_id);
  });

  it("invalidates bindings when the resource reconnects in the same session object", async () => {
    const { manager, session } = setup();
    const target = manager.list()[0]!;
    session.agent.state.resourceSessionId = "reconnected";
    await expect(manager.start(target.target_id, "Inspect")).rejects.toThrow("terminal_changed");
  });

  it("enforces explicit workspace and fixed-terminal scopes", async () => {
    const { manager, scope } = setup();
    const target = manager.list()[0]!;
    scope.value = "workspace";
    await expect(manager.start(target.target_id, "Inspect")).rejects.toThrow("target_mismatch");
    scope.value = "different-target";
    await expect(manager.start(target.target_id, "Inspect")).rejects.toThrow("target_mismatch");
    scope.value = target.target_id;
    await expect(manager.start(target.target_id, "Inspect")).resolves.toMatchObject({ status: "running" });
  });

  it("does not start concurrent tasks or change terminal approval policy", async () => {
    const { manager, session } = setup();
    session.approvalMode = "always";
    const target = manager.list()[0]!;
    await manager.start(target.target_id, "Inspect");
    await expect(manager.start(target.target_id, "Inspect again")).rejects.toThrow("terminal_busy");
    expect(session.approvalMode).toBe("always");
    session.pendingApprovals.add("approval-1");
    await nextTick();
    expect(manager.tasks[0]?.status).toBe("waiting_approval");
  });

  it("waits through pending approval without busy polling and wakes when its state changes", async () => {
    vi.useFakeTimers();
    const { manager, session } = setup();
    const started = await manager.start(manager.list()[0]!.target_id, "Inspect");
    session.pendingApprovals.add("approval-1");
    await nextTick();
    let resolved = false;
    const wait = manager.read(started.task_id, 30000, new AbortController().signal).then((result) => {
      resolved = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);
    session.pendingApprovals.clear();
    await nextTick();
    expect(await wait).toMatchObject({ status: "running", done: false });
  });

  it("reports disconnection without approving or cancelling a replacement session", async () => {
    const { manager, registry } = setup();
    const started = await manager.start(manager.list()[0]!.target_id, "Inspect");
    const replacement = terminal("replacement");
    registry.set("pane-a", replacement);
    await nextTick();
    expect(await manager.read(started.task_id, 0, new AbortController().signal)).toMatchObject({
      status: "interrupted",
      error: "terminal_changed",
      done: true
    });
    expect(() => manager.assertTask(manager.tasks[0]!)).toThrow("terminal_changed");
    manager.cancel();
    expect(replacement.agent.actions.cancel).not.toHaveBeenCalled();
  });

  it("cancels its child when the conversation is cancelled", async () => {
    const { manager, session } = setup();
    await manager.start(manager.list()[0]!.target_id, "Inspect");
    manager.cancel();
    expect(session.agent.actions.cancel).toHaveBeenCalledTimes(1);
    expect(session.chat.stop).toHaveBeenCalledTimes(1);
    expect(manager.tasks[0]).toMatchObject({ active: false, status: "interrupted" });
  });

  it("handles cancellation while the terminal dispatch is still pending", async () => {
    const { manager, session } = setup();
    let finishDispatch!: () => void;
    mocks.submit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDispatch = resolve;
        })
    );
    const started = manager.start(manager.list()[0]!.target_id, "Inspect");
    manager.cancel();
    finishDispatch();
    expect(await started).toMatchObject({ status: "interrupted", done: true });
    expect(session.agent.actions.cancel).toHaveBeenCalledTimes(2);
  });

  it("aborts a task-status wait without cancelling the child or leaving a timer", async () => {
    vi.useFakeTimers();
    const { manager, session } = setup();
    const started = await manager.start(manager.list()[0]!.target_id, "Inspect");
    const controller = new AbortController();
    const wait = manager.read(started.task_id, 30000, controller.signal);
    controller.abort();
    await expect(wait).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
    expect(session.agent.actions.cancel).not.toHaveBeenCalled();
    expect(manager.tasks[0]?.active).toBe(true);
  });

  it("rejects unknown tasks, invalid prompts and changed account context", async () => {
    const { manager, assertCurrent } = setup();
    const target = manager.list()[0]!;
    await expect(manager.read("foreign-task", 0, new AbortController().signal)).rejects.toThrow("unknown_task");
    await expect(manager.start(target.target_id, " ")).rejects.toThrow("invalid_prompt");
    await expect(manager.start(target.target_id, "a".repeat(8001))).rejects.toThrow("invalid_prompt");
    assertCurrent.mockImplementation(() => {
      throw new Error("context_changed");
    });
    await expect(manager.start(target.target_id, "Inspect")).rejects.toThrow("context_changed");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("validates exact tool arguments at the local boundary", () => {
    const start = workspaceTerminalTools.find((tool) => tool.name === "start_terminal_task")!;
    expect(() => validateWorkspaceToolArguments(start, { target_id: "target", prompt: "Inspect" })).not.toThrow();
    expect(() =>
      validateWorkspaceToolArguments(start, { target_id: "target", prompt: "Inspect", approved: true })
    ).toThrow();
    expect(() => validateWorkspaceToolArguments(start, { prompt: "Inspect" })).toThrow();
    expect(start.annotations?.readOnlyHint).toBe(false);
  });
});
