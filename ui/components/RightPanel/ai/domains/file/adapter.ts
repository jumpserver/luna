import type { KokoFileAiSession } from "#koko/composables/sftp/useFileAiSessions";
import type { AiContextItem, FileAiEventData, FilePlanItem } from "../../types";
import type { AiPanelDomainAdapter } from "../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import {
  interruptKokoFileAi,
  isKokoFileAiAvailable,
  isKokoFileAiBusy,
  isKokoFileAiWaitingForApproval,
  resolveKokoFileAiApproval,
  submitKokoFileAiPrompt
} from "#koko/composables/sftp/useFileAiSessions";
import { isKokoFileWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";

const completedStatuses = ["completed", "success", "succeeded", "skipped"];
const failedStatuses = ["error", "failed", "rejected", "interrupted"];

function fileSession(session: WorkspaceAiSession): KokoFileAiSession | null {
  return isKokoFileWorkspaceAiSession(session) ? session : null;
}

function runtimeStatusLabel(status: string, t: (key: string) => string) {
  const keys: Record<string, string> = {
    analyzing: "RightPanel.FileAIStageAnalyzing",
    tool_running: "RightPanel.FileAIStageReading",
    awaiting_approval: "RightPanel.FileAIStageApproval",
    executing: "RightPanel.FileAIStageExecuting",
    idle: "RightPanel.FileAIStageReady"
  };
  return keys[status] ? t(keys[status]) : status;
}

function eventRisk(data: FileAiEventData) {
  return Number(data.riskLevel) || 0;
}

export const fileAiPanelDomain: AiPanelDomainAdapter = {
  id: "file",

  matches(session) {
    return isKokoFileWorkspaceAiSession(session);
  },

  describe(session, context) {
    const current = fileSession(session);
    if (!current) throw new Error("File AI domain received a non-file session");

    const fileContext = current.context;
    const busy = isKokoFileAiBusy(current.targetId);
    const waitingForApproval = isKokoFileAiWaitingForApproval(current.targetId);
    const contextItems: AiContextItem[] = [];
    if (fileContext.assetName) {
      contextItems.push({
        key: "asset",
        icon: "i-lucide-server",
        label: `@${fileContext.assetName}`,
        title: fileContext.assetName
      });
    }
    contextItems.push({
      key: "protocol",
      icon: "i-lucide-folder-symlink",
      label: "@SFTP",
      title: "SFTP"
    });
    if (fileContext.account) {
      contextItems.push({
        key: "account",
        icon: "i-lucide-user-key",
        label: `@${fileContext.account}`,
        title: fileContext.account
      });
    }
    if (fileContext.currentPath) {
      contextItems.push({
        key: "path",
        icon: "i-lucide-folder-open",
        label: `@${fileContext.currentPath}`,
        title: fileContext.currentPath
      });
    }
    if (fileContext.selectedEntries.length) {
      contextItems.push({
        key: "selection",
        icon: "i-lucide-list-checks",
        label: `@${context.t("RightPanel.FileAISelection", { count: fileContext.selectedEntries.length })}`,
        title: fileContext.selectedEntries.map((entry) => entry.path || entry.name).join(", ")
      });
    }

    const errorLabel = current.errorCode || current.errorText ? context.t("RightPanel.FileAIFailed") : "";

    return {
      assistantName: context.t("RightPanel.FileAIName"),
      headerDescription: context.t("RightPanel.FileAIHeaderDescription"),
      available: isKokoFileAiAvailable(current.targetId),
      busy,
      waitingForApproval,
      unavailable: {
        icon: "i-lucide-folder-lock",
        title: context.t("RightPanel.FileAIUnavailableTitle"),
        description: current.errorText || context.t("RightPanel.FileAIUnavailableDescription")
      },
      empty: {
        icon: "i-lucide-folder-search-2",
        title: context.t("RightPanel.FileAIEmptyTitle"),
        description: context.t("RightPanel.FileAIEmptyDescription")
      },
      inputPlaceholder: context.t("RightPanel.FileAIInputPlaceholder"),
      actionLabel: busy ? context.t("RightPanel.FileAIInterrupt") : context.t("RightPanel.AISend"),
      runtimeStatusLabel: runtimeStatusLabel(current.runtimeStatusCode || current.runtimeState, context.t),
      errorLabel,
      errorDetail: current.errorText,
      backgroundReasonLabel: "",
      elapsedDurationMs: 0,
      contextItems,
      showPolicy: false,
      showRuntimeStatus: true,
      showElapsedInError: false,
      showActivity: false,
      refreshElapsedWhileBusy: false,
      backgroundExecAvailable: false,
      approvalThreshold: 0,
      executionMode: "",
      thresholdOptions: [],
      modeOptions: []
    };
  },

  summarize(session, _context, items) {
    const current = fileSession(session);
    if (!current) return {};
    const latestPlan = items.findLast((item): item is FilePlanItem => item.kind === "file-plan");
    const steps = latestPlan?.data.steps || [];
    const statuses = steps.map((step) => String(step.status || "pending"));
    let highestRiskLevel = 0;
    let latestOutcome = "";
    for (const item of items) {
      if (item.domain !== "file") continue;
      if (item.kind === "file-action" || item.kind === "file-approval") {
        highestRiskLevel = Math.max(highestRiskLevel, eventRisk(item.data));
      }
      if (item.kind === "file-result") latestOutcome = String(item.data.outcome || "");
    }
    const failed =
      statuses.some((status) => failedStatuses.includes(status)) || ["error", "rejected"].includes(latestOutcome);
    const completed =
      !current.taskActive &&
      (latestOutcome === "success" ||
        (statuses.length > 0 && statuses.every((status) => completedStatuses.includes(status))));
    return {
      runProgress: steps.length
        ? `${statuses.filter((status) => completedStatuses.includes(status)).length}/${steps.length}`
        : "",
      highestRiskLevel,
      outcome: failed ? "error" : completed ? "success" : "ready"
    };
  },

  submit(session, text) {
    const current = fileSession(session);
    if (!current) return;
    void submitKokoFileAiPrompt(current.targetId, text)
      .then(() => {
        if (current.draft.trim() === text) current.draft = "";
      })
      .catch(() => undefined);
  },

  interrupt(session) {
    const current = fileSession(session);
    if (!current) return;
    try {
      interruptKokoFileAi(current.targetId);
    } catch {
      current.errorCode = "interrupt_failed";
      current.errorText = "";
    }
  },

  clearError(session) {
    const current = fileSession(session);
    if (!current) return;
    current.errorCode = "";
    current.errorText = "";
    current.chat.clearError();
  },

  handleTimelineAction(session, action) {
    const current = fileSession(session);
    if (!current || action.domain !== "file" || action.type !== "resolve-file-approval") return;
    try {
      resolveKokoFileAiApproval(current.targetId, action.approvalId, action.decision);
    } catch {
      current.errorCode = "approval_failed";
      current.errorText = "";
    }
  }
};
