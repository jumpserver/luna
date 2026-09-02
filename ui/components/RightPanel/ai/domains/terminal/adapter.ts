import type { KokoTerminalAiSession, TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiTimelineAction, PlanItem } from "../../types";
import type { AiPanelDomainAdapter, AiPanelDomainContext } from "../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import {
  terminalAiBackgroundReasonKey,
  terminalAiErrorKey,
  terminalAiProgressKey
} from "#koko/composables/terminal/terminalAiPresentation";
import {
  createTerminalAiMessageId,
  isKokoTerminalAiAvailable,
  isKokoTerminalAiBusy,
  isKokoTerminalAiWaitingForApproval,
  sendKokoTerminalAiControl,
  submitKokoTerminalAiPrompt
} from "#koko/composables/terminal/useTerminalAiSessions";
import { isKokoTerminalWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { commonSurfaceContext } from "../types";

const completedStatuses = ["completed", "success", "succeeded", "skipped"];
const failedStatuses = ["error", "failed", "rejected", "interrupted"];

function effectiveStepStatus(step: PlanItem["steps"][number]) {
  if (["completed", "failed", "interrupted", "rejected", "skipped"].includes(step.status)) return step.status;
  const execution = step.executions.at(-1);
  if (execution?.command && !execution.result) return String(execution.command.state || step.status);
  return step.status || String(execution?.result?.outcome || "pending");
}

function terminalSession(session: WorkspaceAiSession): KokoTerminalAiSession | null {
  return isKokoTerminalWorkspaceAiSession(session) ? session : null;
}

function translatedProtocolValue(context: AiPanelDomainContext, key: string | undefined, fallback = "") {
  return key ? context.t(key) : fallback;
}

function sendControl(session: KokoTerminalAiSession, message: TerminalAiChatMessage) {
  sendKokoTerminalAiControl(session.paneId, message);
}

function handleDecision(session: KokoTerminalAiSession, action: Extract<AiTimelineAction, { type: "decide" }>) {
  const decisionId = String(action.data.id || "");
  if (!decisionId || session.decisions.has(decisionId)) return;

  session.decisions.add(decisionId);
  try {
    sendControl(session, {
      id: createTerminalAiMessageId("decision"),
      role: "user",
      metadata: { terminalId: Number(session.terminalId) },
      parts: [
        {
          type: "data-approval",
          data: {
            id: action.data.id,
            digest: action.data.digest,
            approved: action.approved,
            execution: session.executionOverrides.get(decisionId) || action.data.execution
          }
        }
      ]
    });
  } catch {
    session.decisions.delete(decisionId);
    session.errorCode = "approval_failed";
    session.errorText = "";
  }
}

export const terminalAiPanelDomain: AiPanelDomainAdapter = {
  id: "terminal",

  matches(session) {
    return isKokoTerminalWorkspaceAiSession(session);
  },

  describe(session, context, _items) {
    const current = terminalSession(session);
    if (!current) throw new Error("Terminal AI domain received a non-terminal session");

    const busy = isKokoTerminalAiBusy(context.paneId);
    const waitingForApproval = isKokoTerminalAiWaitingForApproval(context.paneId);
    const errorKey = terminalAiErrorKey(current.errorCode, current.errorText);
    const errorLabel = translatedProtocolValue(
      context,
      errorKey,
      current.errorText ? context.t("RightPanel.AIFailed") : ""
    );
    const progressKey = terminalAiProgressKey({
      code: current.runtimeStatusCode,
      execution: current.runtimeExecution,
      state: current.runtimeState,
      text: current.runtimeStatus
    });
    const contextItems = commonSurfaceContext(context, "i-lucide-network");
    contextItems.push({
      key: "current-screen",
      icon: "i-lucide-monitor-dot",
      label: `@${context.t("RightPanel.AIContextCurrentScreen")}`,
      title: context.t("RightPanel.AIContextCurrentScreen")
    });

    return {
      assistantName: context.t("TerminalAi.Title"),
      headerDescription: context.t("RightPanel.AIHeaderDescription"),
      available: isKokoTerminalAiAvailable(context.paneId),
      busy,
      running: current.taskActive,
      waitingForApproval,
      unavailable: {
        icon: "i-lucide-sparkles",
        title: context.t("RightPanel.AIUnavailableTitle"),
        description: context.t("RightPanel.AIUnavailableDescription")
      },
      empty: {
        icon: "i-lucide-square-terminal",
        title: context.t("RightPanel.AIEmptyTitle"),
        description: context.t("RightPanel.AIEmptyDescription")
      },
      inputPlaceholder: context.t("RightPanel.AIInputPlaceholder"),
      actionLabel: context.t("RightPanel.AISend"),
      interruptLabel: context.t("RightPanel.AIInterrupt"),
      runtimeStatusLabel: translatedProtocolValue(context, progressKey, current.runtimeStatus),
      errorLabel,
      errorDetail: current.errorText && !errorKey ? current.errorText : "",
      backgroundReasonLabel: translatedProtocolValue(
        context,
        terminalAiBackgroundReasonKey(current.backgroundReasonCode, current.backgroundReason)
      ),
      elapsedDurationMs: 0,
      contextItems,
      toolNames: [...current.agent.state.toolNames],
      showPolicy: true,
      showRuntimeStatus: false,
      showElapsedInError: false,
      showActivity: true,
      refreshElapsedWhileBusy: false,
      backgroundExecAvailable: current.backgroundExec,
      approvalThreshold: current.approvalMode,
      executionMode: current.executionMode,
      thresholdOptions: [
        {
          label: context.t("RightPanel.AIAgentApprovalAlwaysShort"),
          description: context.t("RightPanel.AIAgentApprovalAlways"),
          value: "always"
        },
        {
          label: context.t("RightPanel.AIAgentApprovalAutoShort"),
          description: context.t("RightPanel.AIAgentApprovalAuto"),
          value: "auto"
        },
        {
          label: context.t("RightPanel.AIAgentApprovalNeverShort"),
          description: context.t("RightPanel.AIAgentApprovalNever"),
          value: "never"
        }
      ],
      modeOptions: [
        {
          label: context.t("RightPanel.AIModeAutoShort"),
          description: context.t("RightPanel.AIModeAuto"),
          value: "auto"
        },
        {
          label: context.t("RightPanel.AIModePtyShort"),
          description: context.t("RightPanel.AIModePty"),
          value: "pty"
        },
        {
          label: context.t("RightPanel.AIModeBackgroundShort"),
          description: context.t("RightPanel.AIModeBackground"),
          value: "background",
          disabled: !current.backgroundExec
        }
      ]
    };
  },

  summarize(_session, _context, items) {
    const latestPlan = items.findLast((item): item is PlanItem => item.kind === "plan");
    const steps = latestPlan?.steps || [];
    let highestRiskLevel = 0;
    for (const step of steps) {
      for (const execution of step.executions) {
        highestRiskLevel = Math.max(highestRiskLevel, Number(execution.command?.riskLevel) || 0);
      }
    }
    const statuses = steps.map(effectiveStepStatus);
    return {
      runProgress: steps.length
        ? `${statuses.filter((status) => completedStatuses.includes(status)).length}/${steps.length}`
        : "",
      highestRiskLevel,
      outcome: statuses.some((status) => failedStatuses.includes(status))
        ? "error"
        : statuses.length && statuses.every((status) => completedStatuses.includes(status))
          ? "success"
          : "ready"
    };
  },

  submit(session, text) {
    const current = terminalSession(session);
    if (!current) return;
    void submitKokoTerminalAiPrompt(current.paneId, text)
      .then(() => {
        if (current.draft.trim() === text) current.draft = "";
      })
      .catch(() => undefined);
  },

  interrupt(session) {
    const current = terminalSession(session);
    if (!current) return;
    try {
      sendControl(current, {
        id: createTerminalAiMessageId("interrupt"),
        role: "user",
        metadata: { terminalId: Number(current.terminalId) },
        parts: [{ type: "data-interrupt", data: { reason: "user" } }]
      });
    } catch {
      current.errorCode = "interrupt_failed";
      current.errorText = "";
    }
  },

  clearError(session) {
    const current = terminalSession(session);
    if (!current) return;
    current.errorCode = "";
    current.errorText = "";
    current.chat.clearError();
  },

  updateApprovalThreshold(session, value) {
    const current = terminalSession(session);
    if (!current) return;
    const mode = String(value || "auto");
    const approvalMode = mode === "always" || mode === "never" ? mode : "auto";
    void current.agent.actions.setApprovalMode(approvalMode).catch((error) => {
      current.errorCode = "policy_failed";
      current.errorText = error instanceof Error ? error.message : "Failed to update approval mode";
    });
  },

  updateExecutionMode(session, value) {
    const current = terminalSession(session);
    if (!current) return;
    const mode = String(value || "auto");
    current.executionMode = mode === "pty" || mode === "background" ? mode : "auto";
  },

  handleTimelineAction(session, action) {
    const current = terminalSession(session);
    if (!current) return;
    if (action.type === "decide") {
      handleDecision(current, action);
      return;
    }
    if (action.type === "set-execution-override") {
      current.executionOverrides.set(action.id, action.value);
      return;
    }
    if (action.type === "set-step-expanded") {
      current.expansionOverrides.set(action.key, action.expanded);
      return;
    }
    if (action.type === "resolve-metadata-approval") {
      current.resolveMetadataApproval(action.decision);
    }
  }
};
