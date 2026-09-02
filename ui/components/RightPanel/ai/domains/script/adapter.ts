import type { AiPanelDomainAdapter } from "../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import {
  acceptScriptAiProposal,
  interruptScriptAi,
  isScriptAiAvailable,
  isScriptAiBusy,
  rejectScriptAiProposal,
  submitScriptAiPrompt
} from "~/composables/useScriptAiSessions";
import { isScriptWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";

function scriptSession(session: WorkspaceAiSession) {
  return isScriptWorkspaceAiSession(session) ? session : null;
}

function runtimeStatusKey(code: string, state: string) {
  if (code === "analyzing") return "RightPanel.ScriptAIStageAnalyzing";
  if (code === "planning" || code === "proposing") return "RightPanel.ScriptAIStagePlanning";
  if (code === "tool_running") return "RightPanel.ScriptAIStageReading";
  if (["completed", "idle"].includes(state)) return "RightPanel.ScriptAIStageReady";
  return "";
}

export const scriptAiPanelDomain: AiPanelDomainAdapter = {
  id: "script",

  matches(session) {
    return isScriptWorkspaceAiSession(session);
  },

  describe(session, context) {
    const current = scriptSession(session);
    if (!current) throw new Error("Script AI domain received a non-script session");
    const snapshot = current.contextProvider();
    const busy = isScriptAiBusy(current.paneId);
    const statusKey = runtimeStatusKey(current.runtimeStatusCode, current.runtimeState);
    const contextItems = [
      {
        key: "script",
        icon: "i-lucide-file-code-2",
        label: `@${snapshot.name || context.t("Snippets.Untitled")}`,
        title: snapshot.name || context.t("Snippets.Untitled")
      },
      {
        key: "module",
        icon: "i-lucide-braces",
        label: `@${snapshot.module}`,
        title: snapshot.module
      }
    ];
    if (snapshot.content) {
      contextItems.push({
        key: "buffer",
        icon: "i-lucide-text",
        label: `@${context.t("RightPanel.ScriptAIContextBuffer")}`,
        title: context.t("RightPanel.ScriptAIContextBuffer")
      });
    }

    return {
      assistantName: context.t("RightPanel.ScriptAIName"),
      headerDescription: context.t("RightPanel.ScriptAIHeaderDescription"),
      available: isScriptAiAvailable(current.paneId),
      busy,
      running: current.taskActive,
      waitingForApproval: current.pendingProposalCalls.size > 0,
      unavailable: {
        icon: "i-lucide-file-lock-2",
        title: context.t("RightPanel.ScriptAIUnavailableTitle"),
        description: current.errorText || context.t("RightPanel.ScriptAIUnavailableDescription")
      },
      empty: {
        icon: "i-lucide-file-code-2",
        title: context.t("RightPanel.ScriptAIEmptyTitle"),
        description: context.t("RightPanel.ScriptAIEmptyDescription")
      },
      inputPlaceholder: context.t("RightPanel.ScriptAIInputPlaceholder"),
      actionLabel: context.t("RightPanel.AISend"),
      interruptLabel: context.t("RightPanel.ScriptAIInterrupt"),
      runtimeStatusLabel: statusKey ? context.t(statusKey) : current.runtimeStatus,
      errorLabel: current.errorCode || current.errorText ? context.t("RightPanel.ScriptAIFailed") : "",
      errorDetail: current.errorText,
      backgroundReasonLabel: "",
      elapsedDurationMs: 0,
      contextItems,
      toolNames: [...current.agent.state.toolNames],
      showPolicy: false,
      showRuntimeStatus: true,
      showElapsedInError: false,
      showActivity: false,
      refreshElapsedWhileBusy: false,
      backgroundExecAvailable: false,
      approvalThreshold: current.approvalMode,
      executionMode: "draft_only",
      thresholdOptions: [],
      modeOptions: []
    };
  },

  summarize(session) {
    const current = scriptSession(session);
    if (!current) return {};
    let highestRiskLevel = 0;
    for (const proposal of current.proposals.values()) {
      highestRiskLevel = Math.max(highestRiskLevel, proposal.riskLevel);
    }
    const failed =
      Boolean(current.errorCode || current.errorText) ||
      ["failed", "cancelled", "interrupted"].includes(current.runtimeState);
    const completed = !current.taskActive && ["completed", "idle"].includes(current.runtimeState);
    return { highestRiskLevel, outcome: failed ? "error" : completed ? "success" : "ready" };
  },

  submit(session, text) {
    const current = scriptSession(session);
    if (!current) return;
    void submitScriptAiPrompt(current.paneId, text)
      .then(() => {
        if (current.draft.trim() === text) current.draft = "";
      })
      .catch(() => undefined);
  },

  interrupt(session) {
    const current = scriptSession(session);
    if (current) interruptScriptAi(current.paneId);
  },

  clearError(session) {
    const current = scriptSession(session);
    if (!current) return;
    current.errorCode = "";
    current.errorText = "";
    current.chat.clearError();
  },

  handleTimelineAction(session, action) {
    const current = scriptSession(session);
    if (!current || action.domain !== "script" || current.proposalDecisions.has(action.item.key)) return;
    if (action.type === "reject-proposal") {
      if (rejectScriptAiProposal(current.paneId, action.item.toolCallId)) {
        current.proposalDecisions.set(action.item.key, "rejected");
      }
      return;
    }
    const proposal = current.proposals.get(action.item.toolCallId);
    if (!proposal || proposal !== action.proposal) {
      current.proposalDecisions.set(action.item.key, "stale");
      return;
    }
    const result = acceptScriptAiProposal(current.paneId, action.item.toolCallId, proposal);
    current.proposalDecisions.set(action.item.key, result.applied ? "applied" : "stale");
  }
};
