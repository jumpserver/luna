export type TerminalAiMessageKey = `RightPanel.${string}`;

const executionKeys: Record<string, TerminalAiMessageKey> = {
  background: "RightPanel.AIBackgroundExecution",
  background_exec: "RightPanel.AIBackgroundExecution",
  background_only: "RightPanel.AIBackgroundExecution",
  pty: "RightPanel.AICurrentPty",
  pty_only: "RightPanel.AICurrentPty"
};

const progressKeys: Record<string, TerminalAiMessageKey> = {
  analyzing: "RightPanel.AIProgressAnalyzing",
  executing: "RightPanel.AIProgressExecuting",
  executing_pty: "RightPanel.AIProgressExecutingPty",
  metadata_approval: "RightPanel.AIProgressMetadataApproval",
  metadata_lookup: "RightPanel.AIProgressMetadataLookup",
  planning: "RightPanel.AIProgressPlanning",
  summarizing: "RightPanel.AIProgressSummarizing",
  tool_running: "RightPanel.AIProgressReadingTerminal"
};

const backgroundReasonKeys: Record<string, TerminalAiMessageKey> = {
  background_disabled_by_rules: "RightPanel.AIBackgroundDisabledByRules",
  background_executor_initializing: "RightPanel.AIBackgroundInitializing",
  background_unavailable: "RightPanel.AIBackgroundUnavailable",
  connection_unavailable: "RightPanel.AIBackgroundUnavailable",
  disabled_by_rules: "RightPanel.AIBackgroundDisabledByRules",
  initializing: "RightPanel.AIBackgroundInitializing",
  pty_only: "RightPanel.AIBackgroundPtyOnly",
  unsupported_adapter: "RightPanel.AIBackgroundPtyOnly"
};

// ponytail: older Koko versions send prose instead of codes; remove these aliases after coded events are required.
const legacyBackgroundReasonKeys: Record<string, TerminalAiMessageKey> = {
  "background execution is disabled by terminal ai rules": "RightPanel.AIBackgroundDisabledByRules",
  "background execution is unavailable for this connection": "RightPanel.AIBackgroundUnavailable",
  "background executor is initializing": "RightPanel.AIBackgroundInitializing",
  "database background connection is unavailable": "RightPanel.AIBackgroundUnavailable",
  "ssh background connection is unavailable": "RightPanel.AIBackgroundUnavailable",
  "this asset adapter provides pty execution only": "RightPanel.AIBackgroundPtyOnly"
};

const errorKeys: Record<string, TerminalAiMessageKey> = {
  approval_failed: "RightPanel.AIApprovalFailed",
  approval_rejected: "RightPanel.AIErrorApprovalRejected",
  background_unavailable: "RightPanel.AIBackgroundUnavailable",
  failed: "RightPanel.AIFailed",
  interrupt_failed: "RightPanel.AIInterruptFailed",
  invalid_message: "RightPanel.AIErrorInvalidMessage",
  metadata_approval_failed: "RightPanel.AIMetadataApprovalFailed",
  policy_failed: "RightPanel.AIPolicyFailed",
  response_active: "RightPanel.AIErrorResponseActive",
  send_failed: "RightPanel.AISendFailed",
  unavailable: "RightPanel.AIUnavailableForTerminal"
};

// ponytail: preserve compatibility with uncoded server errors; coded errors remain the upgrade path.
const legacyErrorKeys: Record<string, TerminalAiMessageKey> = {
  "a terminal ai response is already active": "RightPanel.AIErrorResponseActive",
  "another terminal ai task is active": "RightPanel.AIErrorResponseActive",
  "background execution is unavailable": "RightPanel.AIBackgroundUnavailable",
  "chat message has no supported part": "RightPanel.AIErrorInvalidMessage",
  "command approval was rejected": "RightPanel.AIErrorApprovalRejected",
  "failed to send terminal ai message": "RightPanel.AISendFailed",
  "only user chat messages are accepted": "RightPanel.AIErrorInvalidMessage",
  "terminal ai failed": "RightPanel.AIFailed",
  "terminal ai is not available for the active terminal": "RightPanel.AIUnavailableForTerminal",
  "terminal ai is unavailable for this terminal": "RightPanel.AIUnavailableForTerminal",
  "terminal ai message is too large": "RightPanel.AIErrorInvalidMessage",
  "terminal ai requires a user message": "RightPanel.AIErrorInvalidMessage"
};

const aclKeys: Record<string, TerminalAiMessageKey> = {
  accept: "RightPanel.AICommandAclAccepted",
  approved: "RightPanel.AIStatusApproved",
  notify_and_warn: "RightPanel.AICommandAclNotifyAndWarn",
  reject: "RightPanel.AIStatusRejected",
  rejected: "RightPanel.AIStatusRejected",
  review: "RightPanel.AICommandAclReview",
  waiting_for_review: "RightPanel.AICommandAclWaitingReview",
  warning: "RightPanel.AICommandAclWarning"
};

const legacyPtyProgress = new Set([
  "command is running in the current pty; you can interact with it directly in the terminal…",
  "命令正在当前 pty 中执行，可直接在终端交互…"
]);

function normalized(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function terminalAiExecutionKey(value: unknown) {
  return executionKeys[normalized(value)];
}

export function terminalAiProgressKey(data: Record<string, unknown>) {
  const code = normalized(data.code);
  const state = normalized(data.state);
  const execution = normalized(data.execution);
  const text = normalized(data.text);

  if (code && progressKeys[code]) return progressKeys[code];
  if (state === "idle") return undefined;
  if (state === "executing" && (execution === "pty" || legacyPtyProgress.has(text))) {
    return progressKeys.executing_pty;
  }
  return progressKeys[state];
}

export function terminalAiBackgroundReasonKey(code: unknown, reason: unknown) {
  const normalizedCode = normalized(code);
  if (normalizedCode && backgroundReasonKeys[normalizedCode]) return backgroundReasonKeys[normalizedCode];

  const normalizedReason = normalized(reason);
  if (!normalizedReason) return undefined;
  return legacyBackgroundReasonKeys[normalizedReason] || "RightPanel.AIBackgroundUnavailable";
}

export function terminalAiErrorKey(code: unknown, message: unknown) {
  const normalizedCode = normalized(code);
  if (normalizedCode && errorKeys[normalizedCode]) return errorKeys[normalizedCode];
  return legacyErrorKeys[normalized(message)];
}

export function terminalAiAclKey(value: unknown) {
  return aclKeys[normalized(value)];
}
