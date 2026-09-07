<script setup lang="ts">
import type { AiContextItem, AiTimelineAction } from "./ai/types";
import { getKokoTerminalAiSession } from "#koko/composables/terminal/useTerminalAiSessions";
import { useWorkspaceAssistantPanelSession } from "~/composables/useWorkspaceAssistantPanelSession";
import {
  assertWorkspaceTerminalTaskCurrent,
  interruptWorkspaceAssistant,
  isWorkspaceAssistantBusy,
  resolveWorkspaceAssistantApproval,
  submitWorkspaceAssistantPrompt,
  useWorkspaceAssistantRuntime,
  workspaceAssistantMessages,
  workspaceAssistantTerminalTargets
} from "~/composables/useWorkspaceAssistantSession";
import AiComposer from "./ai/AiComposer.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import { terminalAiPanelDomain } from "./ai/domains/terminal/adapter";
import WorkspaceAssistantTimeline from "./workspace/WorkspaceAssistantTimeline.vue";

const { t } = useI18n();
const { activePaneId } = useWorkspaceTabs();
const { pendingTerminalPrompt, takeTerminalPrompt } = useAiPanel();
const assistantRuntime = useWorkspaceAssistantRuntime();
const { session, scopeId, newSession } = useWorkspaceAssistantPanelSession(assistantRuntime);
const approvingScopes = reactive(new Set<string>());
const approvalProcessing = computed(() => approvingScopes.has(scopeId.value));

const assistantName = computed(() => t("RightPanel.LunaAiName"));
const available = computed(() => Boolean(session.value?.enabled && session.value.agent.state.available));
const busy = computed(() => Boolean(session.value && isWorkspaceAssistantBusy(scopeId.value)));
const running = computed(() =>
  Boolean(
    session.value?.taskActive || session.value?.inputLocked || session.value?.terminalTasks.some((task) => task.active)
  )
);
const terminalTargets = computed(() => (scopeId.value ? workspaceAssistantTerminalTargets(scopeId.value) : []));
const selectedTarget = computed({
  get: () => session.value?.target || "auto",
  set: (value: string) => {
    if (session.value) session.value.target = value;
  }
});
const currentTarget = computed(() =>
  terminalTargets.value.find((target) =>
    selectedTarget.value === "auto" ? target.pane_id === activePaneId.value : target.target_id === selectedTarget.value
  )
);
const targetOptions = computed(() => [
  { value: "auto", label: t("RightPanel.LunaAiAutomatic"), icon: "i-lucide-sparkles" },
  { value: "workspace", label: t("RightPanel.LunaAiWorkspaceOnly"), icon: "i-lucide-layout-dashboard" },
  ...terminalTargets.value.map((target) => ({
    value: target.target_id,
    label: `${target.asset_name} · ${target.account}`,
    icon: "i-lucide-terminal",
    disabled: !target.available
  })),
  ...(!["auto", "workspace"].includes(selectedTarget.value) && !currentTarget.value
    ? [
        {
          value: selectedTarget.value,
          label: t("RightPanel.LunaAiTargetChanged"),
          icon: "i-lucide-unplug",
          disabled: true
        }
      ]
    : [])
]);
const messages = computed(() => workspaceAssistantMessages(session.value));
const draft = computed({
  get: () => session.value?.draft || "",
  set: (value: string) => {
    if (session.value) session.value.draft = value;
  }
});
const waitingStatus = computed(() => {
  const activeTasks = session.value?.terminalTasks.filter((task) => task.active) || [];
  if (activeTasks.some((task) => task.status === "waiting_approval")) return "RightPanel.AIStatusAwaitingApproval";
  if (activeTasks.some((task) => task.status === "waiting_input")) return "RightPanel.AIStatusWaitingInput";
  return "";
});
const statusTone = computed<"ready" | "active" | "warning" | "error" | "success">(() => {
  if (session.value?.errorCode || session.value?.errorText) return "error";
  if (!available.value) return "warning";
  if (waitingStatus.value) return "warning";
  if (running.value) return "active";
  if (session.value?.runtimeState === "completed") return "success";
  return "ready";
});
const statusLabel = computed(() => {
  if (session.value?.errorCode || session.value?.errorText) return t("RightPanel.AIStatusFailed");
  if (!available.value) return t("RightPanel.SessionStatusConnecting");
  if (waitingStatus.value) return t(waitingStatus.value);
  if (running.value) return t("RightPanel.AIStatusRunning");
  if (session.value?.runtimeState === "completed") return t("RightPanel.AIStatusCompleted");
  return t("RightPanel.AIStatusReady");
});
const displayedTarget = computed(() =>
  running.value
    ? session.value?.terminalTasks.find((task) => task.active)?.target ||
      (session.value?.runContext?.default_terminal_target as typeof currentTarget.value)
    : currentTarget.value
);
const contextItems = computed<AiContextItem[]>(() => {
  const target = displayedTarget.value;
  if (!target) return [];
  return [
    { key: "terminal", icon: "i-lucide-terminal", label: `@${target.asset_name}`, title: target.address },
    { key: "account", icon: "i-lucide-user-key", label: target.account, title: target.account }
  ];
});

function terminalAction(taskId: string, action: AiTimelineAction) {
  const task = session.value?.terminalTasks.find((item) => item.id === taskId);
  if (!task) return;
  try {
    if (!["set-step-expanded", "set-execution-override"].includes(action.type))
      assertWorkspaceTerminalTaskCurrent(scopeId.value, taskId);
    terminalAiPanelDomain.handleTimelineAction(task.session, action, {
      paneId: task.session.paneId,
      surface: null,
      now: Date.now(),
      t
    });
  } catch {
    session.value!.errorText = t("RightPanel.LunaAiTargetChanged");
  }
}

async function submit() {
  const content = draft.value.trim();
  if (!content || !session.value || busy.value) return;
  const submittedSession = session.value;
  draft.value = "";
  try {
    await submitWorkspaceAssistantPrompt(content, submittedSession.scopeId);
  } catch {
    if (!submittedSession.taskActive) submittedSession.draft = content;
  }
}

async function decideApproval(approvalId: string, decision: "approve" | "reject") {
  if (!approvalId || approvalProcessing.value) return;
  const approvalScope = scopeId.value;
  approvingScopes.add(approvalScope);
  try {
    await resolveWorkspaceAssistantApproval(approvalId, decision, approvalScope);
  } finally {
    approvingScopes.delete(approvalScope);
  }
}

function clearError() {
  if (!session.value) return;
  session.value.errorCode = "";
  session.value.errorText = "";
  session.value.chat.clearError();
}

// A shortcut carries a concrete pane; resolve its current binding once before sending.
watch(
  [available, busy, pendingTerminalPrompt],
  async () => {
    const request = pendingTerminalPrompt.value;
    if (!request || !session.value || !available.value || busy.value) return;
    const userInfo = assistantRuntime.userInfoStore;
    if (request.loginContext !== JSON.stringify([userInfo.currentSite, userInfo.currentAccountId, userInfo.orgId])) {
      takeTerminalPrompt(request.id);
      return;
    }
    const original = getKokoTerminalAiSession(request.paneId);
    const target =
      original?.agent.state.resourceSessionId === request.resourceId &&
      original.agent.state.agentSessionId === request.agentId
        ? terminalTargets.value.find((item) => item.pane_id === request.paneId)
        : null;
    takeTerminalPrompt(request.id);
    draft.value = request.text;
    if (!target?.available) {
      session.value.errorText = t("RightPanel.LunaAiTargetChanged");
      return;
    }
    selectedTarget.value = target.target_id;
    await submit();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AiPresenceHeader
      :assistant-name="assistantName"
      :description="t('RightPanel.LunaAiDescription')"
      :status-label="statusLabel"
      :status-tone="statusTone"
      :busy="running && !waitingStatus"
      :context-items="contextItems"
      :tool-names="[]"
    >
      <template #actions>
        <UTooltip v-if="session" :text="t('RightPanel.AINewSessionDescription')">
          <UButton
            icon="i-lucide-plus"
            :aria-label="t('RightPanel.AINewSession')"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="newSession"
          />
        </UTooltip>
        <slot name="actions" />
      </template>
    </AiPresenceHeader>

    <div v-if="!session" class="grid min-h-0 flex-1 place-items-center p-4">
      <UEmpty
        icon="i-lucide-monitor-x"
        size="sm"
        variant="naked"
        :title="t('RightPanel.WorkspaceAssistantUnavailableTitle')"
        :description="t('RightPanel.WorkspaceAssistantUnavailableDescription')"
      />
    </div>

    <template v-else>
      <WorkspaceAssistantTimeline
        :key="scopeId"
        :messages="messages"
        :terminal-tasks="session.terminalTasks"
        :terminal-targets="terminalTargets"
        :scope-id="scopeId"
        :has-terminal="Boolean(currentTarget)"
        :running="Boolean(session.taskActive && !session.terminalTasks.some((task) => task.active))"
        :assistant-name="assistantName"
        :approval-processing="approvalProcessing"
        @decide-approval="decideApproval"
        @terminal-action="terminalAction"
        @suggest="draft = $event"
      />

      <footer class="shrink-0 space-y-2 border-t border-default p-3">
        <div
          v-if="session.errorCode || session.errorText"
          class="flex items-start gap-2 rounded-lg bg-error/10 p-2 text-[11px] text-error"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
          <span class="min-w-0 flex-1 break-words">{{ session.errorText || session.errorCode }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="t('Common.Close')"
            @click="clearError"
          />
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <USelect
            v-model="selectedTarget"
            :items="targetOptions"
            value-key="value"
            label-key="label"
            size="xs"
            variant="soft"
            :disabled="running"
            :aria-label="t('RightPanel.LunaAiTarget')"
            icon="i-lucide-scan"
            class="min-w-0 flex-1"
            portal="#workspace-ai-overlay"
          />
          <span
            v-if="selectedTarget === 'auto' && displayedTarget"
            class="max-w-32 truncate text-[11px] text-muted"
            :title="displayedTarget.address"
          >
            @{{ displayedTarget.asset_name }}
          </span>
        </div>
        <AiComposer
          v-model="draft"
          :show-policy="false"
          :busy="busy || !available || approvalProcessing"
          :running="running"
          :action-label="t('RightPanel.AISend')"
          :interrupt-label="t('RightPanel.AIInterrupt')"
          :placeholder="t('RightPanel.LunaAiPlaceholder')"
          :approval-threshold="session.approvalMode"
          execution-mode="foreground"
          :threshold-options="[]"
          :mode-options="[]"
          @submit="submit"
          @interrupt="interruptWorkspaceAssistant(scopeId)"
        />
        <p class="text-center text-[9px] leading-4 text-muted">
          {{ t("RightPanel.WorkspaceAssistantScopeNotice") }}
        </p>
      </footer>
    </template>
  </div>
</template>
