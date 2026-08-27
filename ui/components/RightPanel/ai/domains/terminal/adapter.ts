import type { KokoTerminalAiSession, TerminalAiChatMessage } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiTimelineAction } from "../../types";
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
import { isChenSqlWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { commonSurfaceContext } from "../types";

function terminalSession(session: WorkspaceAiSession): KokoTerminalAiSession | null {
  return isChenSqlWorkspaceAiSession(session) ? null : session;
}

function translatedProtocolValue(context: AiPanelDomainContext, key: string | undefined, fallback = "") {
  return key ? context.t(key) : fallback;
}

function sendControl(session: KokoTerminalAiSession, message: TerminalAiChatMessage) {
  sendKokoTerminalAiControl(session.paneId, message);
}

function updatePolicy(session: KokoTerminalAiSession) {
  try {
    sendControl(session, {
      id: createTerminalAiMessageId("policy"),
      role: "user",
      metadata: { terminalId: Number(session.terminalId) },
      parts: [
        {
          type: "data-policy",
          data: {
            approvalThreshold: session.approvalThreshold,
            executionMode: session.executionMode
          }
        }
      ]
    });
  } catch {
    session.errorCode = "policy_failed";
    session.errorText = "";
  }
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
    return !isChenSqlWorkspaceAiSession(session);
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
      actionLabel: busy ? context.t("RightPanel.AIInterrupt") : context.t("RightPanel.AISend"),
      runtimeStatusLabel: translatedProtocolValue(context, progressKey, current.runtimeStatus),
      errorLabel,
      errorDetail: current.errorText && !errorKey ? current.errorText : "",
      backgroundReasonLabel: translatedProtocolValue(
        context,
        terminalAiBackgroundReasonKey(current.backgroundReasonCode, current.backgroundReason)
      ),
      elapsedDurationMs: 0,
      contextItems,
      showPolicy: true,
      showRuntimeStatus: false,
      showElapsedInError: false,
      showActivity: true,
      approvalThreshold: current.approvalThreshold,
      executionMode: current.executionMode,
      thresholdOptions: [
        {
          label: context.t("RightPanel.AIApprovalAllShort"),
          description: context.t("RightPanel.AIApprovalAll"),
          value: 1
        },
        {
          label: context.t("RightPanel.AIApprovalRisk2Short"),
          description: context.t("RightPanel.AIApprovalRisk2"),
          value: 2
        },
        {
          label: context.t("RightPanel.AIApprovalRisk3Short"),
          description: context.t("RightPanel.AIApprovalRisk3"),
          value: 3
        },
        {
          label: context.t("RightPanel.AIApprovalRisk4Short"),
          description: context.t("RightPanel.AIApprovalRisk4"),
          value: 4
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
          value: "pty_only"
        },
        {
          label: context.t("RightPanel.AIModeBackgroundShort"),
          description: context.t("RightPanel.AIModeBackground"),
          value: "background_only",
          disabled: !current.backgroundExec
        }
      ]
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
    current.approvalThreshold = Number(value) || 2;
    updatePolicy(current);
  },

  updateExecutionMode(session, value) {
    const current = terminalSession(session);
    if (!current) return;
    current.executionMode = String(value || "auto");
    updatePolicy(current);
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
