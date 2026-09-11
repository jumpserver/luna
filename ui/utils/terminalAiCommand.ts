interface TerminalAiShortcutEvent {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function isTerminalAiCommandShortcut(event: TerminalAiShortcutEvent, isMacOS: boolean) {
  const primaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return !event.repeat && !event.altKey && !event.shiftKey && primaryModifier && event.code === "KeyK";
}

export function isTerminalAiHistoryShortcut(event: TerminalAiShortcutEvent, isMacOS: boolean) {
  const primaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return !event.repeat && !event.altKey && event.shiftKey && primaryModifier && event.code === "KeyK";
}

export function terminalAiCommandShortcutAction(available: boolean, busy: boolean) {
  if (!available) return "ignore" as const;
  return busy ? ("hud" as const) : ("popover" as const);
}

export interface TerminalAiLiveMessage {
  role?: string;
  parts?: Array<{ type?: string; text?: string; data?: Record<string, unknown> }>;
}

export interface TerminalAiLiveTask {
  id?: string;
  active?: boolean;
  status?: string;
  prompt?: string;
  messages?: TerminalAiLiveMessage[];
}

function partData(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const settledApprovalStates = new Set(["approved", "consumed", "rejected", "expired", "cancelled"]);

function assistantText(messages: TerminalAiLiveMessage[], start = 0) {
  return messages
    .slice(start)
    .flatMap((message) =>
      message.role === "assistant"
        ? (message.parts || []).flatMap((part) => (part.type === "text" && part.text?.trim() ? [part.text.trim()] : []))
        : []
    )
    .join("\n");
}

export function terminalAiLiveTurn(messages: TerminalAiLiveMessage[], tasks: TerminalAiLiveTask[] = []) {
  let lastUser = "";
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    lastUser = (message.parts || [])
      .flatMap((part) => (part.type === "text" && part.text?.trim() ? [part.text.trim()] : []))
      .join("\n");
    lastUserIndex = index;
    break;
  }

  const turnTaskIds = new Set<string>();
  for (const message of messages.slice(lastUserIndex + 1)) {
    for (const part of message.parts || []) {
      if (part.type !== "data-terminal-task") continue;
      const id = String(partData(part.data).taskId || "");
      if (id) turnTaskIds.add(id);
    }
  }
  const lastAssistant = [
    assistantText(messages, lastUserIndex + 1),
    ...tasks
      .filter((task) => task.id && turnTaskIds.has(task.id) && task.active === false)
      .map((task) => assistantText(task.messages || []))
  ]
    .filter(Boolean)
    .join("\n\n");

  const approvals = new Map<string, { id: string; toolName: string; command: string; pending: boolean }>();
  for (const message of messages) {
    for (const part of message.parts || []) {
      if (part.type !== "data-approval") continue;
      const data = partData(part.data);
      const id = String(data.approvalId || data.id || "");
      if (!id) continue;
      const pending = !data.resolved && !settledApprovalStates.has(String(data.state || ""));
      approvals.set(id, {
        id,
        toolName: String(data.toolName || data.tool_name || data.tool || ""),
        command: String(partData(data.arguments).command || data.query || ""),
        pending
      });
    }
  }
  const pendingApprovals = [...approvals.values()]
    .filter((item) => item.pending)
    .map(({ pending: _pending, ...item }) => item);
  const activeTasks = tasks.filter((task) => task.active);
  const waitingApproval =
    pendingApprovals.length > 0 ||
    activeTasks.some((task) => task.status === "waiting_approval" || task.status === "waiting_input");
  const failed = activeTasks.some((task) => task.status === "failed");

  return {
    lastUser,
    lastAssistant,
    pendingApprovals,
    activeTasks,
    waitingApproval,
    failed,
    live: waitingApproval || failed || activeTasks.length > 0 || Boolean(lastAssistant)
  };
}

const TERMINAL_AI_HINT_MIN_WIDTH = 80;
export const TERMINAL_AI_HINT_IDLE_MS = 500;

export function shouldShowTerminalAiCaretHint(sessionInfoReady: boolean, maxWidth: number, idle = true) {
  return idle && sessionInfoReady && maxWidth >= TERMINAL_AI_HINT_MIN_WIDTH;
}
