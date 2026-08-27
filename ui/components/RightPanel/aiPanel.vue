<script setup lang="ts">
import type { TerminalAiChatMessage, TerminalAiEventData } from "#koko/composables/terminal/useTerminalAiSessions";
import type { AiContextItem, PlanItem, SqlProposalItem, SqlThoughtItem, ViewItem } from "./ai/types";
import type { ChenSqlAiTiming, ChenSqlMetadataApprovalDecision } from "~/chen/composables/useChenSqlAiSessions";
import {
  terminalAiAclKey,
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
import { getWorkspaceAiSession, isChenSqlWorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import AiComposer from "./ai/AiComposer.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import AiRunPlan from "./ai/AiRunPlan.vue";
import { buildAiPanelViewItems } from "./ai/buildViewItems";
import { aiRiskColor, formatAiDuration, renderAiMarkdown } from "./ai/presentation";
import SqlMetadataApprovalCard from "./SqlMetadataApprovalCard.vue";
import SqlSchemaResultCard from "./SqlSchemaResultCard.vue";

const { t } = useI18n();
const { activePaneId, activeTab } = useWorkspaceTabs();
const messagesElement = useTemplateRef<HTMLElement>("messagesElement");
const session = computed(() => getWorkspaceAiSession(activePaneId.value));
const sqlSession = computed(() => (isChenSqlWorkspaceAiSession(session.value) ? session.value : null));
const activeSurface = computed(() => {
  const tab = activeTab.value;
  return tab?.panes.find((pane) => pane.id === activePaneId.value) || tab;
});
const metadataApproval = computed(() => session.value?.metadataApproval || null);
const assistantName = computed(() => (sqlSession.value ? t("RightPanel.SQLAIName") : t("TerminalAi.Title")));
const available = computed(() =>
  sqlSession.value ? Boolean(session.value?.enabled) : isKokoTerminalAiAvailable(activePaneId.value)
);
const unavailableTitle = computed(() =>
  sqlSession.value ? t("RightPanel.SQLAIUnavailableTitle") : t("RightPanel.AIUnavailableTitle")
);
const unavailableDescription = computed(() => {
  if (sqlSession.value?.errorText) return sqlSession.value.errorText;
  return sqlSession.value ? t("RightPanel.SQLAIUnavailableDescription") : t("RightPanel.AIUnavailableDescription");
});
// AI SDK mutates its shallow message array before triggering the ref, so expose
// a new reference to invalidate viewItems and other computed consumers.
const messages = computed(() => [...(session.value?.chat.messages.value || [])]);
const busy = computed(() => {
  if (session.value && !sqlSession.value) return isKokoTerminalAiBusy(activePaneId.value);
  const status = session.value?.chat.status.value;
  return status === "submitted" || status === "streaming";
});
const actionLabel = computed(() =>
  busy.value ? (sqlSession.value ? t("RightPanel.SQLAICancel") : t("RightPanel.AIInterrupt")) : t("RightPanel.AISend")
);
const elapsedClock = shallowRef(Date.now());
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

function stopElapsedTimer() {
  if (elapsedTimer !== null) clearInterval(elapsedTimer);
  elapsedTimer = null;
}

watch(
  () => Boolean(sqlSession.value && busy.value),
  (running) => {
    stopElapsedTimer();
    elapsedClock.value = Date.now();
    if (running && import.meta.client) {
      elapsedTimer = setInterval(() => {
        elapsedClock.value = Date.now();
      }, 500);
    }
  },
  { immediate: true }
);
onBeforeUnmount(stopElapsedTimer);

const sqlElapsedDurationMs = computed(() => {
  const current = sqlSession.value;
  if (!current) return 0;
  const serverDuration = Number(current.timing.durationMs) || 0;
  if (busy.value && current.requestStartedAt > 0) {
    return Math.max(serverDuration, elapsedClock.value - current.requestStartedAt);
  }
  return Number(current.timing.clientDurationMs) || serverDuration;
});
const draft = computed({
  get: () => session.value?.draft || "",
  set: (value: string) => {
    if (session.value) session.value.draft = value;
  }
});

const thresholdOptions = computed(() => [
  {
    label: t("RightPanel.AIApprovalAllShort"),
    description: t("RightPanel.AIApprovalAll"),
    value: 1
  },
  {
    label: t("RightPanel.AIApprovalRisk2Short"),
    description: t("RightPanel.AIApprovalRisk2"),
    value: 2
  },
  {
    label: t("RightPanel.AIApprovalRisk3Short"),
    description: t("RightPanel.AIApprovalRisk3"),
    value: 3
  },
  {
    label: t("RightPanel.AIApprovalRisk4Short"),
    description: t("RightPanel.AIApprovalRisk4"),
    value: 4
  }
]);

const modeOptions = computed(() => [
  {
    label: t("RightPanel.AIModeAutoShort"),
    description: t("RightPanel.AIModeAuto"),
    value: "auto"
  },
  {
    label: t("RightPanel.AIModePtyShort"),
    description: t("RightPanel.AIModePty"),
    value: "pty_only"
  },
  {
    label: t("RightPanel.AIModeBackgroundShort"),
    description: t("RightPanel.AIModeBackground"),
    value: "background_only",
    disabled: !session.value?.backgroundExec
  }
]);

function translatedProtocolValue(key: string | undefined, fallback = "") {
  return key ? t(key) : fallback;
}

const errorLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  if (sqlSession.value) return current.errorText ? t("RightPanel.SQLAIFailed") : "";
  const key = terminalAiErrorKey(current.errorCode, current.errorText);
  return translatedProtocolValue(key, current.errorText ? t("RightPanel.AIFailed") : "");
});

const errorDetail = computed(() => {
  const current = session.value;
  if (sqlSession.value) return current?.errorText || "";
  if (!current?.errorText || terminalAiErrorKey(current.errorCode, current.errorText)) return "";
  return current.errorText;
});

const runtimeStatusLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  if (sqlSession.value) {
    const keys: Record<string, string> = {
      analyzing: "RightPanel.SQLAIStageAnalyzing",
      model: "RightPanel.SQLAIStageModel",
      reviewing: "RightPanel.SQLAIStageReviewing",
      approval: "RightPanel.SQLAIMetadataApprovalStage",
      tool:
        current.runtimeExecution === "validate_sql" ? "RightPanel.SQLAIStageValidation" : "RightPanel.SQLAIStageTool",
      cancelled: "RightPanel.SQLAIStageCancelled"
    };
    const key = keys[current.runtimeStatusCode];
    return key ? t(key) : current.runtimeStatus;
  }
  const key = terminalAiProgressKey({
    code: current.runtimeStatusCode,
    execution: current.runtimeExecution,
    state: current.runtimeState,
    text: current.runtimeStatus
  });
  return translatedProtocolValue(key, current.runtimeStatus);
});

const backgroundReasonLabel = computed(() => {
  const current = session.value;
  if (!current) return "";
  return translatedProtocolValue(terminalAiBackgroundReasonKey(current.backgroundReasonCode, current.backgroundReason));
});

const viewItems = computed<ViewItem[]>(() =>
  buildAiPanelViewItems({
    messages: messages.value,
    metadataApproval: metadataApproval.value,
    terminalMetadataApproval: !sqlSession.value,
    executionPlanLabel: t("RightPanel.AIExecutionPlan"),
    stepLabel: (count) => t("RightPanel.AIStep", { count })
  })
);
const waitingForTerminalApproval = computed(() => {
  const current = session.value;
  if (!current || sqlSession.value) return false;
  return isKokoTerminalAiWaitingForApproval(activePaneId.value);
});

const latestPlan = computed(() => viewItems.value.filter((item): item is PlanItem => item.kind === "plan").at(-1));

function effectiveStepStatus(step: PlanItem["steps"][number]) {
  if (["completed", "failed", "interrupted", "rejected", "skipped"].includes(step.status)) return step.status;
  const execution = step.executions.at(-1);
  if (execution?.command && !execution.result) return String(execution.command.state || step.status);
  return step.status || String(execution?.result?.outcome || "pending");
}

const runProgress = computed(() => {
  const steps = latestPlan.value?.steps || [];
  if (!steps.length) return "";
  const complete = steps.filter((step) =>
    ["completed", "success", "succeeded", "skipped"].includes(effectiveStepStatus(step))
  ).length;
  return `${complete}/${steps.length}`;
});

const highestRiskLevel = computed(() => {
  let level = 0;
  for (const step of latestPlan.value?.steps || []) {
    for (const execution of step.executions) {
      level = Math.max(level, Number(execution.command?.riskLevel) || 0);
    }
  }
  for (const item of viewItems.value) {
    if (item.kind === "sql-analysis") level = Math.max(level, Number(item.data.riskLevel) || 0);
  }
  return level;
});

function riskLabel(level: number) {
  const labels: Record<number, string> = {
    1: t("RightPanel.AIRiskReadOnly"),
    2: t("RightPanel.AIRiskLow"),
    3: t("RightPanel.AIRiskMedium"),
    4: t("RightPanel.AIRiskHigh")
  };
  return labels[level] || "";
}

const headerRiskLabel = computed(() => (highestRiskLevel.value >= 2 ? riskLabel(highestRiskLevel.value) : ""));
const presenceStatusTone = computed<"ready" | "active" | "warning" | "error" | "success">(() => {
  if (errorLabel.value) return "error";
  if (metadataApproval.value || waitingForTerminalApproval.value) return "warning";
  if (busy.value) return "active";
  const statuses = latestPlan.value?.steps.map(effectiveStepStatus) || [];
  if (statuses.some((status) => ["error", "failed", "rejected", "interrupted"].includes(status))) return "error";
  if (
    statuses.length &&
    statuses.every((status) => ["completed", "success", "succeeded", "skipped"].includes(status))
  ) {
    return "success";
  }
  return "ready";
});
const presenceStatusLabel = computed(() => {
  if (errorLabel.value) return errorLabel.value;
  if (metadataApproval.value || waitingForTerminalApproval.value) return t("RightPanel.AIStatusAwaitingApproval");
  if (busy.value) return runtimeStatusLabel.value || t("RightPanel.AIStatusRunning");
  if (presenceStatusTone.value === "success") return t("RightPanel.AIStatusCompleted");
  if (presenceStatusTone.value === "error") return t("RightPanel.AIStatusFailed");
  return t("RightPanel.AIStatusReady");
});
const headerDescription = computed(() =>
  sqlSession.value ? t("RightPanel.SQLAIHeaderDescription") : t("RightPanel.AIHeaderDescription")
);
const contextItems = computed<AiContextItem[]>(() => {
  const items: AiContextItem[] = [];
  const surface = activeSurface.value;
  if (surface?.assetName) {
    items.push({
      key: "asset",
      icon: "i-lucide-server",
      label: `@${surface.assetName}`,
      title: [surface.assetName, surface.address].filter(Boolean).join(" · ")
    });
  }
  if (surface?.protocol) {
    items.push({
      key: "protocol",
      icon: sqlSession.value ? "i-lucide-database" : "i-lucide-network",
      label: `@${surface.protocol}`,
      title: surface.protocol
    });
  }
  if (surface?.account) {
    items.push({
      key: "account",
      icon: "i-lucide-user-key",
      label: `@${surface.account}`,
      title: surface.account
    });
  }
  if (!sqlSession.value) {
    items.push({
      key: "current-screen",
      icon: "i-lucide-monitor-dot",
      label: `@${t("RightPanel.AIContextCurrentScreen")}`,
      title: t("RightPanel.AIContextCurrentScreen")
    });
  }

  const sqlContext = sqlSession.value?.contextProvider();
  if (sqlContext?.database) {
    items.push({
      key: "database",
      icon: "i-lucide-cylinder",
      label: `@${sqlContext.database}`,
      title: sqlContext.database
    });
  }
  if (sqlContext?.schema) {
    items.push({
      key: "schema",
      icon: "i-lucide-table-properties",
      label: `@${sqlContext.schema}`,
      title: sqlContext.schema
    });
  }
  if (sqlContext?.selectedSql) {
    items.push({
      key: "selection",
      icon: "i-lucide-text-select",
      label: `@${t("RightPanel.AIContextSelection")}`,
      title: t("RightPanel.AIContextSelection")
    });
  }
  if (sqlContext?.lastError) {
    items.push({
      key: "last-error",
      icon: "i-lucide-circle-alert",
      label: `@${t("RightPanel.AIContextLastError")}`,
      title: t("RightPanel.AIContextLastError")
    });
  }
  return items;
});

const terminalActivityLabel = computed(() => runtimeStatusLabel.value || t("RightPanel.AIResponding"));

function scrollToBottom() {
  void nextTick(() => {
    if (messagesElement.value) messagesElement.value.scrollTop = messagesElement.value.scrollHeight;
  });
}

function sendMessage(message: TerminalAiChatMessage) {
  if (sqlSession.value) return;
  sendKokoTerminalAiControl(activePaneId.value, message);
}

function submit() {
  const current = session.value;
  const text = draft.value.trim();
  if (!current || !text || busy.value || !available.value) return;

  if (!sqlSession.value) {
    void submitKokoTerminalAiPrompt(activePaneId.value, text)
      .then(() => {
        if (current.draft.trim() === text) current.draft = "";
        scrollToBottom();
      })
      .catch(() => undefined);
    return;
  }

  current.draft = "";
  current.errorCode = "";
  current.errorText = "";
  current.chat.clearError();
  scrollToBottom();

  void current.chat.sendMessage({ text, metadata: { operation: "generate" } }).catch(() => {
    if (!current.errorCode && !current.errorText) current.errorCode = "send_failed";
  });
}

function updatePolicy() {
  const current = session.value;
  if (!current || sqlSession.value) return;

  try {
    sendMessage({
      id: createTerminalAiMessageId("policy"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [
        {
          type: "data-policy",
          data: {
            approvalThreshold: current.approvalThreshold,
            executionMode: current.executionMode
          }
        }
      ]
    });
  } catch {
    current.errorCode = "policy_failed";
    current.errorText = "";
  }
}

function changeApprovalThreshold(value: unknown) {
  const current = session.value;
  if (!current) return;
  current.approvalThreshold = Number(value) || 2;
  updatePolicy();
}

function changeExecutionMode(value: unknown) {
  const current = session.value;
  if (!current) return;
  current.executionMode = String(value || "auto");
  updatePolicy();
}

function decide(data: TerminalAiEventData, approved: boolean) {
  const current = session.value;
  const decisionId = String(data.id || "");
  if (!current || sqlSession.value || !decisionId || current.decisions.has(decisionId)) return;

  current.decisions.add(decisionId);
  try {
    sendMessage({
      id: createTerminalAiMessageId("decision"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [
        {
          type: "data-approval",
          data: {
            id: data.id,
            digest: data.digest,
            approved,
            execution: current.executionOverrides.get(decisionId) || data.execution
          }
        }
      ]
    });
  } catch {
    current.decisions.delete(decisionId);
    current.errorCode = "approval_failed";
    current.errorText = "";
  }
}

function interrupt() {
  const current = session.value;
  if (!current) return;

  if (sqlSession.value) {
    sqlSession.value.cancelActive();
    return;
  }

  try {
    sendMessage({
      id: createTerminalAiMessageId("interrupt"),
      role: "user",
      metadata: { terminalId: Number(current.terminalId) },
      parts: [{ type: "data-interrupt", data: { reason: "user" } }]
    });
  } catch {
    current.errorCode = "interrupt_failed";
    current.errorText = "";
  }
}

function clearError() {
  const current = session.value;
  if (!current) return;
  current.errorCode = "";
  current.errorText = "";
  current.chat.clearError();
}

function setExecutionOverride(id: string, value: string) {
  session.value?.executionOverrides.set(id, value);
}

function aclLabel(data: TerminalAiEventData) {
  const value = data.state || data.action;
  return translatedProtocolValue(terminalAiAclKey(value), String(value || ""));
}

function setStepExpanded(key: string, expanded: boolean) {
  session.value?.expansionOverrides.set(key, expanded);
}

function proposalDecision(item: SqlProposalItem) {
  return sqlSession.value?.proposalDecisions.get(item.key) || "";
}

function applySqlProposal(item: SqlProposalItem) {
  const current = sqlSession.value;
  if (!current || proposalDecision(item)) return;
  const result = current.applyProposal(item.data);
  current.proposalDecisions.set(item.key, result.applied ? "applied" : "stale");
}

function rejectSqlProposal(item: SqlProposalItem) {
  const current = sqlSession.value;
  if (!current || proposalDecision(item)) return;
  current.proposalDecisions.set(item.key, "rejected");
}

function resolveMetadataApproval(decision: ChenSqlMetadataApprovalDecision) {
  session.value?.resolveMetadataApproval(decision);
}

function isSqlThoughtExpanded(item: SqlThoughtItem) {
  return sqlSession.value?.expansionOverrides.get(item.key) ?? false;
}

function setSqlThoughtExpanded(item: SqlThoughtItem, expanded: boolean) {
  sqlSession.value?.expansionOverrides.set(item.key, expanded);
}

function sqlAnalysisErrors(data: TerminalAiEventData) {
  return Array.isArray(data.errors) ? data.errors.map(String) : [];
}

function sqlAnalysisItems(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function sqlTimingTotal(data: ChenSqlAiTiming) {
  return Number(data.clientDurationMs) || Number(data.durationMs) || 0;
}

watch(
  [activePaneId, () => messages.value.length, () => messages.value.at(-1)?.parts.length, metadataApproval],
  scrollToBottom
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="!available" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        icon="i-lucide-sparkles"
        size="sm"
        variant="naked"
        :title="unavailableTitle"
        :description="unavailableDescription"
      />
    </div>

    <template v-else-if="session">
      <AiPresenceHeader
        :assistant-name="assistantName"
        :description="headerDescription"
        :status-label="presenceStatusLabel"
        :status-tone="presenceStatusTone"
        :busy="busy"
        :context-items="contextItems"
        :run-progress="runProgress"
        :risk-label="headerRiskLabel"
        :risk-color="aiRiskColor(highestRiskLevel)"
      />

      <main ref="messagesElement" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <UEmpty
          v-if="messages.length === 0"
          :icon="sqlSession ? 'i-lucide-database-zap' : 'i-lucide-square-terminal'"
          size="sm"
          variant="naked"
          :title="sqlSession ? t('RightPanel.SQLAIEmptyTitle') : t('RightPanel.AIEmptyTitle')"
          :description="sqlSession ? t('RightPanel.SQLAIEmptyDescription') : t('RightPanel.AIEmptyDescription')"
        />

        <template v-for="item in viewItems" :key="item.key">
          <article
            v-if="item.kind === 'text'"
            class="flex gap-2"
            :class="item.role === 'user' ? 'flex-row-reverse' : ''"
          >
            <span
              class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary"
            >
              <UIcon :name="item.role === 'user' ? 'i-lucide-user-round' : 'i-lucide-sparkles'" class="size-3.5" />
            </span>
            <div class="min-w-0 max-w-[88%]" :class="item.role === 'user' ? 'text-right' : ''">
              <div class="text-[10px] text-muted">
                {{ item.role === "user" ? t("RightPanel.AIYou") : assistantName }}
              </div>
              <div
                class="markdown-body mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
                :class="item.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
                v-html="renderAiMarkdown(item.text)"
              />
            </div>
          </article>

          <SqlMetadataApprovalCard
            v-else-if="item.kind === 'metadata-approval'"
            :approval="item.approval"
            :terminal="item.terminal"
            @resolve="resolveMetadataApproval"
          />

          <SqlSchemaResultCard v-else-if="item.kind === 'schema-result'" :data="item.data" />

          <UCollapsible
            v-else-if="item.kind === 'sql-thought'"
            :open="isSqlThoughtExpanded(item)"
            class="overflow-hidden rounded-xl border border-default bg-elevated/40"
            @update:open="setSqlThoughtExpanded(item, $event)"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              class="min-h-9 cursor-pointer justify-start rounded-none px-2.5 py-2"
            >
              <UIcon name="i-lucide-brain" class="size-3.5 shrink-0 text-primary" />
              <span class="shrink-0 text-[11px] font-medium text-highlighted">
                {{ t("RightPanel.SQLAIThoughtSummary") }}
              </span>
              <span
                v-if="!isSqlThoughtExpanded(item)"
                class="min-w-0 flex-1 truncate text-left text-[10px] font-normal text-muted"
                :title="item.summaries.at(-1)"
              >
                {{ item.summaries.at(-1) }}
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="ml-auto size-3.5 shrink-0 text-muted transition-transform duration-150"
                :class="isSqlThoughtExpanded(item) ? 'rotate-90' : ''"
              />
            </UButton>

            <template #content>
              <div class="space-y-1.5 border-t border-default px-2.5 py-2 text-[11px] leading-5 text-muted">
                <p
                  v-for="summary in item.summaries"
                  :key="summary"
                  class="whitespace-pre-wrap [overflow-wrap:anywhere]"
                >
                  {{ summary }}
                </p>
              </div>
            </template>
          </UCollapsible>

          <section
            v-else-if="item.kind === 'sql-analysis'"
            class="space-y-2 rounded-xl border border-default bg-elevated/60 p-2.5"
          >
            <header class="flex flex-wrap items-center gap-1.5">
              <span class="mr-auto text-xs font-semibold text-highlighted">
                {{ t("RightPanel.SQLAIAnalysis") }}
              </span>
              <UBadge :color="item.data.valid ? 'success' : 'error'" variant="subtle" size="xs">
                {{ item.data.valid ? t("RightPanel.SQLAIValid") : t("RightPanel.SQLAIInvalid") }}
              </UBadge>
              <UBadge v-if="item.data.statementType" color="neutral" variant="subtle" size="xs">
                {{ item.data.statementType }}
              </UBadge>
              <UBadge
                v-if="Number(item.data.riskLevel) > 0"
                :color="aiRiskColor(Number(item.data.riskLevel))"
                variant="subtle"
                size="xs"
              >
                {{ t("RightPanel.AIRisk", { level: item.data.riskLevel }) }}
              </UBadge>
            </header>
            <p v-if="item.data.riskReason" class="text-[11px] text-muted">
              {{ item.data.riskReason }}
            </p>
            <div v-if="sqlAnalysisItems(item.data.tables).length" class="text-[11px]">
              <span class="text-muted">{{ t("RightPanel.SQLAITables") }}:</span>
              {{ sqlAnalysisItems(item.data.tables).join(", ") }}
            </div>
            <div v-if="sqlAnalysisItems(item.data.columns).length" class="text-[11px]">
              <span class="text-muted">{{ t("RightPanel.SQLAIColumns") }}:</span>
              {{ sqlAnalysisItems(item.data.columns).join(", ") }}
            </div>
            <ul v-if="sqlAnalysisErrors(item.data).length" class="space-y-1 text-[11px] text-error">
              <li v-for="error in sqlAnalysisErrors(item.data)" :key="error" class="flex items-start gap-1.5">
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
                <span class="break-words">{{ error }}</span>
              </li>
            </ul>
          </section>

          <section
            v-else-if="item.kind === 'sql-proposal'"
            class="overflow-hidden rounded-xl border border-default bg-elevated/60"
          >
            <header class="flex items-center gap-2 border-b border-default px-2.5 py-2">
              <UIcon name="i-lucide-file-diff" class="size-4 text-primary" />
              <span class="mr-auto text-xs font-semibold text-highlighted">
                {{ t("RightPanel.SQLAIProposal") }}
              </span>
              <UBadge v-if="proposalDecision(item)" color="neutral" variant="subtle" size="xs">
                {{ t(`RightPanel.SQLAIProposalState.${proposalDecision(item)}`) }}
              </UBadge>
            </header>
            <div
              v-if="item.data.explanation"
              class="markdown-body border-b border-default p-2.5 text-xs text-muted"
              v-html="renderAiMarkdown(String(item.data.explanation))"
            />
            <div class="grid min-h-0 gap-px bg-[var(--app-border)] sm:grid-cols-2">
              <div class="min-w-0 bg-default">
                <div class="border-b border-default bg-error/10 px-2 py-1 text-[10px] font-medium text-error">
                  {{ t("RightPanel.SQLAIBefore") }}
                </div>
                <pre
                  class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
                ><code>{{ item.data.originalSql || t("RightPanel.SQLAINewQuery") }}</code></pre>
              </div>
              <div class="min-w-0 bg-default">
                <div class="border-b border-default bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
                  {{ t("RightPanel.SQLAIAfter") }}
                </div>
                <pre
                  class="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]"
                ><code>{{ item.data.sql }}</code></pre>
              </div>
            </div>
            <div v-if="!proposalDecision(item)" class="flex justify-end gap-1.5 border-t border-default p-2">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :label="t('RightPanel.AIReject')"
                @click="rejectSqlProposal(item)"
              />
              <UButton
                size="xs"
                color="primary"
                icon="i-lucide-check"
                :label="t('RightPanel.SQLAIApply')"
                @click="applySqlProposal(item)"
              />
            </div>
          </section>

          <section
            v-else-if="item.kind === 'sql-timing'"
            class="rounded-xl border border-default bg-elevated/40 px-2.5 py-2 text-[11px] text-muted"
          >
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-clock-3" class="size-3.5 text-primary" />
              <span class="font-medium text-highlighted">{{ t("RightPanel.SQLAITiming") }}</span>
              <span class="ml-auto font-mono tabular-nums text-highlighted">
                {{ formatAiDuration(sqlTimingTotal(item.data)) }}
              </span>
            </div>
            <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              <span v-if="Number(item.data.modelDurationMs) > 0">
                {{ t("RightPanel.SQLAIModelDuration") }}
                · {{ formatAiDuration(item.data.modelDurationMs) }}
              </span>
              <span v-if="Number(item.data.toolDurationMs) > 0">
                {{ t("RightPanel.SQLAIToolDuration") }}
                · {{ formatAiDuration(item.data.toolDurationMs) }}
              </span>
              <span v-if="Number(item.data.queueDurationMs) >= 1">
                {{ t("RightPanel.SQLAIQueueDuration") }}
                · {{ formatAiDuration(item.data.queueDurationMs) }}
              </span>
            </div>
          </section>

          <AiRunPlan
            v-else-if="item.kind === 'plan'"
            :plan="item"
            :decisions="session.decisions"
            :expansion-overrides="session.expansionOverrides"
            :execution-overrides="session.executionOverrides"
            :execution-mode="session.executionMode"
            :background-exec="session.backgroundExec"
            @decide="decide"
            @set-execution-override="setExecutionOverride"
            @set-step-expanded="setStepExpanded"
          />

          <div
            v-else-if="item.kind === 'alert'"
            class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-[11px] text-warning"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
            {{ t("RightPanel.AICommandAcl") }}:
            {{ aclLabel(item.data) }}
            {{ item.data.decision?.name || item.data.name || "" }}
          </div>
        </template>

        <article
          v-if="busy && !sqlSession && !waitingForTerminalApproval"
          role="status"
          aria-live="polite"
          class="flex gap-2"
        >
          <span
            class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary"
          >
            <UIcon name="i-lucide-sparkles" class="size-3.5" />
          </span>
          <div class="min-w-0 max-w-[88%]">
            <div class="text-[10px] text-muted">{{ assistantName }}</div>
            <div
              class="mt-1 flex items-center gap-2 rounded-xl rounded-tl-sm border border-default bg-elevated px-2.5 py-2 text-[11px] text-muted"
            >
              <UIcon name="i-lucide-loader-circle" class="size-3.5 shrink-0 animate-spin text-primary" />
              <span>{{ terminalActivityLabel }}</span>
            </div>
          </div>
        </article>
      </main>

      <footer class="shrink-0 space-y-2 border-t border-default p-3">
        <div v-if="errorLabel" class="flex items-start gap-2 rounded-lg bg-error/10 p-2 text-[11px] text-error">
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block">{{ errorLabel }}</span>
            <span v-if="errorDetail" class="mt-0.5 block break-words text-[10px] opacity-80">{{ errorDetail }}</span>
            <span
              v-if="sqlSession && sqlElapsedDurationMs > 0"
              class="mt-1 flex items-center gap-1 font-mono text-[10px] tabular-nums opacity-80"
            >
              <UIcon name="i-lucide-clock-3" class="size-3" />
              {{ t("RightPanel.SQLAITiming") }} · {{ formatAiDuration(sqlElapsedDurationMs) }}
            </span>
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('koko.actions.close')"
            @click="clearError"
          />
        </div>
        <div v-if="sqlSession && (runtimeStatusLabel || busy)" class="flex items-center gap-1.5 text-[11px] text-muted">
          <UIcon
            :name="busy ? 'i-lucide-loader-circle' : 'i-lucide-circle-dot'"
            class="size-3"
            :class="{ 'animate-spin': busy }"
          />
          <span>{{ runtimeStatusLabel }}</span>
          <span v-if="sqlSession" class="ml-auto font-mono tabular-nums text-highlighted">
            {{ formatAiDuration(sqlElapsedDurationMs) }}
          </span>
        </div>
        <p v-if="!sqlSession && !session.backgroundExec && backgroundReasonLabel" class="text-[11px] text-muted">
          {{ backgroundReasonLabel }}
        </p>
        <AiComposer
          v-model="draft"
          :sql="Boolean(sqlSession)"
          :busy="busy"
          :action-label="actionLabel"
          :placeholder="sqlSession ? t('RightPanel.SQLAIInputPlaceholder') : t('RightPanel.AIInputPlaceholder')"
          :approval-threshold="session.approvalThreshold"
          :execution-mode="session.executionMode"
          :threshold-options="thresholdOptions"
          :mode-options="modeOptions"
          @submit="submit"
          @interrupt="interrupt"
          @update-approval-threshold="changeApprovalThreshold"
          @update-execution-mode="changeExecutionMode"
        />
      </footer>
    </template>
  </div>
</template>

<style scoped>
.markdown-body {
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.markdown-body.compact {
  font-weight: 600;
  line-height: 1.45;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.4rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.3rem 0;
  padding-left: 1.2rem;
}

.markdown-body :deep(li + li) {
  margin-top: 0.2rem;
}

.markdown-body :deep(a) {
  color: var(--ui-color-primary-500);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-color-primary-500);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  overflow: auto;
  margin: 0.4rem 0;
  padding: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg-soft);
  white-space: pre-wrap;
}

.markdown-body :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: 0.4rem 0;
  padding-left: 0.55rem;
  border-left: 2px solid var(--ui-color-primary-500);
  color: var(--app-muted);
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 0.4rem 0;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--app-border);
  text-align: left;
}
</style>
