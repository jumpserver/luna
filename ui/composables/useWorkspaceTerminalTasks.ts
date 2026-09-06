import type { KokoTerminalAiSession, TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AgentMcpTool } from "#koko/composables/agent/types";
import type { WorkspacePane } from "./useWorkspaceTabs";
import { shallowReactive, watch } from "vue";
import { getKokoTerminalAiSession, submitKokoTerminalAiPrompt } from "#koko/composables/terminal/useTerminalAiSessions";

const identifier = { type: "string", minLength: 1, maxLength: 160 };
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const workspaceTerminalTools: AgentMcpTool[] = [
  {
    name: "list_terminal_targets",
    description:
      "List connected terminals in the current organization with opaque target_id bindings. Use the request's default_terminal_target for 'current terminal'; switching UI tabs does not change that request target. Disambiguate named assets. Never guess a target_id.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    annotations: read
  },
  {
    name: "start_terminal_task",
    description:
      "Delegate a bounded user task to an exact target_id from list_terminal_targets or default_terminal_target. The terminal assistant retains its command approvals and audit. After connecting an asset, list targets for the returned pane_id. Returns task_id, not a completed result; call get_terminal_task until finished. Never approve commands on the user's behalf.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["target_id", "prompt"],
      properties: {
        target_id: identifier,
        prompt: { type: "string", minLength: 1, maxLength: 8000 }
      }
    },
    annotations: { ...read, readOnlyHint: false, idempotentHint: false }
  },
  {
    name: "get_terminal_task",
    description:
      "Read a delegated task and its result. Use wait_ms=30000 while running. Waiting approvals are shown in Luna: do not start another task or resolve them yourself. Report completion only after completed; report failed/interrupted outcomes accurately.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["task_id"],
      properties: {
        task_id: identifier,
        wait_ms: { type: "integer", minimum: 0, maximum: 30000 }
      }
    },
    annotations: read
  }
];

export interface WorkspaceTerminalTarget {
  target_id: string;
  pane_id: string;
  asset_name: string;
  address: string;
  account: string;
  protocol: string;
  available: boolean;
  busy: boolean;
}
export type WorkspaceTerminalTaskStatus =
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "completed"
  | "failed"
  | "interrupted";
export interface WorkspaceTerminalTask {
  id: string;
  prompt: string;
  target: WorkspaceTerminalTarget;
  session: KokoTerminalAiSession;
  messages: TerminalAiChatMessage[];
  status: WorkspaceTerminalTaskStatus;
  error: string;
  active: boolean;
}
interface TargetBinding {
  target: WorkspaceTerminalTarget;
  pane: WorkspacePane;
  session: KokoTerminalAiSession;
  resourceId: string;
  agentId: string;
}

export function createWorkspaceTerminalTasks(options: {
  panes: () => WorkspacePane[];
  organizationId: string;
  assertCurrent: () => void;
  targetScope: () => string;
  onStart: (task: WorkspaceTerminalTask) => void;
}) {
  const tasks = shallowReactive<WorkspaceTerminalTask[]>([]);
  const bindings = new Map<string, TargetBinding>();
  const stops = new Map<string, () => void>();
  const taskBindings = new Map<string, TargetBinding>();
  const id = () => globalThis.crypto.randomUUID();
  const allowedPanes = () => options.panes().filter((pane) => !pane.orgId || pane.orgId === options.organizationId);
  function current(binding: TargetBinding) {
    return (
      allowedPanes().includes(binding.pane) &&
      binding.pane.status === "connected" &&
      getKokoTerminalAiSession(binding.pane.id) === binding.session &&
      binding.session.connected &&
      binding.session.agent.state.resourceSessionId === binding.resourceId &&
      binding.session.agent.state.agentSessionId === binding.agentId
    );
  }
  function busy(session: KokoTerminalAiSession) {
    return Boolean(
      session.taskActive ||
      session.inputLocked ||
      session.metadataApproval ||
      session.pendingApprovals.size ||
      ["submitted", "streaming"].includes(session.chat.status.value)
    );
  }
  function list() {
    options.assertCurrent();
    for (const [key, binding] of bindings) if (!current(binding)) bindings.delete(key);
    return allowedPanes().flatMap((pane) => {
      const session = getKokoTerminalAiSession(pane.id);
      if (!session || pane.status !== "connected" || !session.connected) return [];
      let binding = [...bindings.values()].find((value) => value.pane === pane && current(value));
      if (!binding) {
        binding = {
          pane,
          session,
          resourceId: session.agent.state.resourceSessionId,
          agentId: session.agent.state.agentSessionId,
          target: {
            target_id: id(),
            pane_id: pane.id,
            asset_name: pane.assetName,
            address: pane.address,
            account: pane.account,
            protocol: pane.protocol,
            available: false,
            busy: false
          }
        };
        bindings.set(binding.target.target_id, binding);
      }
      return [
        { ...binding.target, available: Boolean(session.enabled && session.agent.state.available), busy: busy(session) }
      ];
    });
  }
  function target(targetId: string) {
    return list().find((item) => item.target_id === targetId) || null;
  }
  function assertTask(task: WorkspaceTerminalTask) {
    options.assertCurrent();
    const binding = taskBindings.get(task.id);
    if (!binding || !current(binding))
      throw new Error("terminal_changed: the original terminal was closed or reconnected");
  }
  function result(task: WorkspaceTerminalTask) {
    const text =
      task.messages
        .filter((message) => message.role === "assistant")
        .flatMap((message) =>
          message.parts.flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text] : []))
        )
        .at(-1) || "";
    return {
      task_id: task.id,
      target: task.target,
      status: task.status,
      done: !task.active,
      summary: text.slice(-16000),
      summary_truncated: text.length > 16000,
      ...(task.error ? { error: task.error } : {})
    };
  }
  async function start(targetId: string, prompt: string) {
    options.assertCurrent();
    if (!prompt.trim() || prompt.length > 8000)
      throw new Error("invalid_prompt: provide a task of at most 8000 characters");
    const scope = options.targetScope();
    if (scope === "workspace" || (scope !== "auto" && scope !== targetId))
      throw new Error("target_mismatch: choose the terminal selected by the user");
    const binding = bindings.get(targetId);
    if (!binding || !current(binding))
      throw new Error("terminal_changed: list terminals again and select a current target");
    const session = binding.session;
    if (!session.enabled || !session.agent.state.available)
      throw new Error("terminal_unavailable: terminal AI is not ready");
    if (busy(session) || tasks.some((task) => task.session === session && task.active))
      throw new Error("terminal_busy: wait for the existing task");
    const messageStart = session.chat.messages.value.length;
    const task = shallowReactive<WorkspaceTerminalTask>({
      id: id(),
      prompt,
      target: { ...binding.target, available: true, busy: false },
      session,
      messages: [],
      status: "running",
      error: "",
      active: true
    });
    tasks.push(task);
    taskBindings.set(task.id, binding);
    options.onStart(task);
    let dispatched = false;
    function inspect() {
      if (!task.active) return;
      task.messages = [...session.chat.messages.value.slice(messageStart)];
      if (!current(binding!)) {
        task.status = "interrupted";
        task.error = "terminal_changed";
        task.active = false;
      } else if (session.metadataApproval || session.pendingApprovals.size) task.status = "waiting_approval";
      else if (session.runtimeState === "waiting_input") task.status = "waiting_input";
      else if (dispatched && !busy(session)) {
        task.status =
          session.errorCode || session.errorText || ["failed", "error"].includes(session.runtimeState)
            ? "failed"
            : ["cancelled", "interrupted"].includes(session.runtimeState)
              ? "interrupted"
              : "completed";
        task.error = session.errorText || session.errorCode;
        task.active = false;
      } else task.status = "running";
      if (!task.active) {
        stops.get(task.id)?.();
        stops.delete(task.id);
      }
    }
    stops.set(
      task.id,
      watch(
        () => [
          session.chat.messages.value,
          session.chat.status.value,
          session.taskActive,
          session.inputLocked,
          session.pendingApprovals.size,
          session.metadataApproval,
          session.runtimeState,
          session.errorCode,
          session.errorText,
          current(binding)
        ],
        inspect,
        { flush: "post" }
      )
    );
    try {
      // Use the physical session ID, never its active-pane alias, throughout this task.
      await submitKokoTerminalAiPrompt(session.paneId, prompt);
      dispatched = true;
      if (!task.active && current(binding)) await session.agent.actions.cancel();
      inspect();
    } catch (cause) {
      if (task.active) {
        task.status = "failed";
        task.error = cause instanceof Error ? cause.message : "terminal_task_failed";
        task.active = false;
      }
      stops.get(task.id)?.();
      stops.delete(task.id);
    }
    return result(task);
  }
  async function read(taskId: string, waitMs: number, signal: AbortSignal) {
    options.assertCurrent();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("unknown_task: terminal task does not belong to this conversation");
    if (waitMs > 0 && task.active) {
      const initialStatus = task.status;
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        let stop: () => void;
        function abort() {
          cleanup();
          reject(new DOMException("Terminal task wait cancelled", "AbortError"));
        }
        function cleanup() {
          clearTimeout(timer);
          stop();
          signal.removeEventListener("abort", abort);
        }
        const finish = () => {
          cleanup();
          resolve();
        };
        timer = setTimeout(finish, Math.min(30000, waitMs));
        stop = watch(
          () => task.status,
          () => {
            if (!task.active || task.status !== initialStatus) finish();
          },
          { flush: "sync" }
        );
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    options.assertCurrent();
    return result(task);
  }
  function cancel() {
    for (const task of tasks.filter((item) => item.active)) {
      // Cancellation is sent only to the captured session; a replacement never receives it.
      const binding = taskBindings.get(task.id)!;
      if (current(binding)) {
        void task.session.agent.actions.cancel().catch(() => {
          task.error = "interrupt_failed";
        });
        task.session.chat.stop();
      }
      task.status = "interrupted";
      task.active = false;
      stops.get(task.id)?.();
      stops.delete(task.id);
    }
  }
  function dispose() {
    cancel();
    stops.forEach((stop) => stop());
    stops.clear();
    bindings.clear();
    taskBindings.clear();
  }
  return { tasks, list, target, start, read, assertTask, cancel, dispose };
}
