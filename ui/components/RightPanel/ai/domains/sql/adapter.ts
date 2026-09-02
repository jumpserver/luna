import type { AiPanelDomainAdapter } from "../types";
import type { ChenSqlAiSession } from "~/chen/composables/useChenSqlAiSessions";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { isChenSqlWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { commonSurfaceContext } from "../types";

function sqlSession(session: WorkspaceAiSession): ChenSqlAiSession | null {
  return isChenSqlWorkspaceAiSession(session) ? session : null;
}

export const sqlAiPanelDomain: AiPanelDomainAdapter = {
  id: "sql",

  matches(session) {
    return isChenSqlWorkspaceAiSession(session);
  },

  describe(session, context, _items) {
    const current = sqlSession(session);
    if (!current) throw new Error("SQL AI domain received a non-SQL session");

    const status = current.chat.status.value;
    const busy = status === "submitted" || status === "streaming";
    const runtimeKeys: Record<string, string> = {
      analyzing: "RightPanel.SQLAIStageAnalyzing",
      model: "RightPanel.SQLAIStageModel",
      planning: "RightPanel.SQLAIStageModel",
      reviewing: "RightPanel.SQLAIStageReviewing",
      proposing: "RightPanel.SQLAIStageReviewing",
      approval: "RightPanel.SQLAIMetadataApprovalStage",
      tool:
        current.runtimeExecution === "validate_sql" ? "RightPanel.SQLAIStageValidation" : "RightPanel.SQLAIStageTool",
      tool_running:
        current.runtimeExecution === "validate_sql" ? "RightPanel.SQLAIStageValidation" : "RightPanel.SQLAIStageTool",
      metadata_lookup: "RightPanel.SQLAIStageTool",
      cancelled: "RightPanel.SQLAIStageCancelled"
    };
    const runtimeKey = runtimeKeys[current.runtimeStatusCode];
    const serverDuration = Number(current.timing.durationMs) || 0;
    const elapsedDurationMs =
      busy && current.requestStartedAt > 0
        ? Math.max(serverDuration, context.now - current.requestStartedAt)
        : Number(current.timing.clientDurationMs) || serverDuration;
    const contextItems = commonSurfaceContext(context, "i-lucide-database");
    const sqlContext = current.contextProvider();
    if (sqlContext?.database) {
      contextItems.push({
        key: "database",
        icon: "i-lucide-cylinder",
        label: `@${sqlContext.database}`,
        title: sqlContext.database
      });
    }
    if (sqlContext?.schema) {
      contextItems.push({
        key: "schema",
        icon: "i-lucide-table-properties",
        label: `@${sqlContext.schema}`,
        title: sqlContext.schema
      });
    }
    if (sqlContext?.selectedSql) {
      contextItems.push({
        key: "selection",
        icon: "i-lucide-text-select",
        label: `@${context.t("RightPanel.AIContextSelection")}`,
        title: context.t("RightPanel.AIContextSelection")
      });
    }
    if (sqlContext?.lastError) {
      contextItems.push({
        key: "last-error",
        icon: "i-lucide-circle-alert",
        label: `@${context.t("RightPanel.AIContextLastError")}`,
        title: context.t("RightPanel.AIContextLastError")
      });
    }

    return {
      assistantName: context.t("RightPanel.SQLAIName"),
      headerDescription: context.t("RightPanel.SQLAIHeaderDescription"),
      available: Boolean(current.enabled),
      busy,
      running: busy,
      waitingForApproval: Boolean(current.metadataApproval || current.pendingProposalCalls.size),
      unavailable: {
        icon: "i-lucide-sparkles",
        title: context.t("RightPanel.SQLAIUnavailableTitle"),
        description: current.errorText || context.t("RightPanel.SQLAIUnavailableDescription")
      },
      empty: {
        icon: "i-lucide-database-zap",
        title: context.t("RightPanel.SQLAIEmptyTitle"),
        description: context.t("RightPanel.SQLAIEmptyDescription")
      },
      inputPlaceholder: context.t("RightPanel.SQLAIInputPlaceholder"),
      actionLabel: context.t("RightPanel.AISend"),
      interruptLabel: context.t("RightPanel.SQLAICancel"),
      runtimeStatusLabel: runtimeKey ? context.t(runtimeKey) : current.runtimeStatus,
      errorLabel: current.errorText ? context.t("RightPanel.SQLAIFailed") : "",
      errorDetail: current.errorText,
      backgroundReasonLabel: "",
      elapsedDurationMs,
      contextItems,
      toolNames: [...current.agent.state.toolNames],
      showPolicy: false,
      showRuntimeStatus: false,
      showElapsedInError: true,
      showActivity: true,
      refreshElapsedWhileBusy: true,
      backgroundExecAvailable: false,
      approvalThreshold: current.approvalThreshold,
      executionMode: current.executionMode,
      thresholdOptions: [],
      modeOptions: []
    };
  },

  summarize(_session, _context, items) {
    let highestRiskLevel = 0;
    for (const item of items) {
      if (item.kind === "sql-analysis") {
        highestRiskLevel = Math.max(highestRiskLevel, Number(item.data.riskLevel) || 0);
      }
    }
    return { highestRiskLevel, outcome: "ready" };
  },

  submit(session, text) {
    const current = sqlSession(session);
    if (!current) return;
    current.draft = "";
    void current.request("generate", text).catch(() => {
      if (!current.errorCode && !current.errorText) current.errorCode = "send_failed";
    });
  },

  interrupt(session) {
    sqlSession(session)?.cancelActive();
  },

  clearError(session) {
    const current = sqlSession(session);
    if (!current) return;
    current.errorCode = "";
    current.errorText = "";
    current.chat.clearError();
  },

  handleTimelineAction(session, action) {
    const current = sqlSession(session);
    if (!current || action.domain !== "sql") return;
    if (action.type === "resolve-metadata-approval") {
      current.resolveMetadataApproval(action.decision);
      return;
    }
    if (action.type === "set-thought-expanded") {
      current.expansionOverrides.set(action.key, action.expanded);
      return;
    }
    const proposalId = action.item.toolCallId || action.item.key;
    const existingDecision = current.proposalDecisions.get(proposalId);
    if (existingDecision) return;
    if (action.type === "reject-proposal") {
      if (current.rejectProposal(proposalId)) current.proposalDecisions.set(proposalId, "rejected");
      return;
    }
    const result = current.applyProposal(proposalId);
    current.proposalDecisions.set(proposalId, result.applied ? "applied" : "stale");
  }
};
