<script setup lang="ts">
import type { AiContextItem } from "./ai/types";
import type { WorkspaceAssistantSession } from "~/composables/useWorkspaceAssistantSession";
import {
  disposeWorkspaceAssistantSession,
  ensureWorkspaceAssistantSession,
  interruptWorkspaceAssistant,
  isWorkspaceAssistantBusy,
  resolveWorkspaceAssistantApproval,
  submitWorkspaceAssistantPrompt,
  useWorkspaceAssistantRuntime,
  workspaceAssistantMessages,
  workspaceAssistantScopeId
} from "~/composables/useWorkspaceAssistantSession";
import { useUserInfoStore } from "~/store/modules/userInfo";
import AiComposer from "./ai/AiComposer.vue";
import AiPresenceHeader from "./ai/AiPresenceHeader.vue";
import WorkspaceAssistantTimeline from "./workspace/WorkspaceAssistantTimeline.vue";

const { t } = useI18n();
const userInfoStore = useUserInfoStore();
const { currentAccountId, currentSite, loggedIn, orgId } = storeToRefs(userInfoStore);
const automation = useWorkspaceUiAutomation();
const assistantRuntime = useWorkspaceAssistantRuntime();
const session = shallowRef<WorkspaceAssistantSession | null>(null);
const approvalProcessing = shallowRef(false);
let ownedScope = "";

const assistantName = computed(() => t("RightPanel.WorkspaceAssistantName"));
const available = computed(() => Boolean(session.value?.enabled && session.value.agent.state.available));
const busy = computed(() => Boolean(session.value && isWorkspaceAssistantBusy(ownedScope)));
const running = computed(() => Boolean(session.value?.taskActive || session.value?.inputLocked));
const messages = computed(() => workspaceAssistantMessages(session.value));
const draft = computed({
  get: () => session.value?.draft || "",
  set: (value: string) => {
    if (session.value) session.value.draft = value;
  }
});
const statusTone = computed<"ready" | "active" | "warning" | "error" | "success">(() => {
  if (session.value?.errorCode || session.value?.errorText) return "error";
  if (!available.value) return "warning";
  if (running.value) return "active";
  if (session.value?.runtimeState === "completed") return "success";
  return "ready";
});
const statusLabel = computed(() => {
  if (session.value?.errorCode || session.value?.errorText) return t("RightPanel.AIStatusFailed");
  if (!available.value) return t("RightPanel.SessionStatusConnecting");
  if (running.value) return t("RightPanel.AIStatusRunning");
  if (session.value?.runtimeState === "completed") return t("RightPanel.AIStatusCompleted");
  return t("RightPanel.AIStatusReady");
});
const contextItems = computed<AiContextItem[]>(() => {
  const snapshot = automation.snapshot.value;
  const items: AiContextItem[] = [];
  if (snapshot.focusedAsset) {
    items.push({
      key: "asset",
      icon: "i-lucide-server",
      label: snapshot.focusedAsset.name || snapshot.focusedAsset.address,
      title: snapshot.focusedAsset.address || snapshot.focusedAsset.name
    });
  } else if (snapshot.searchQuery) {
    items.push({
      key: "search",
      icon: "i-lucide-search",
      label: snapshot.searchQuery,
      title: snapshot.searchQuery
    });
  }
  return items;
});

function replaceSession() {
  automation.clearAssetSelectionRequest();
  if (ownedScope) disposeWorkspaceAssistantSession(ownedScope);
  const nextScope = workspaceAssistantScopeId();
  ownedScope = nextScope;
  session.value = ensureWorkspaceAssistantSession(nextScope, assistantRuntime);
}

async function submit() {
  const content = draft.value.trim();
  if (!content || !session.value || busy.value) return;
  draft.value = "";
  try {
    await submitWorkspaceAssistantPrompt(content, ownedScope);
  } catch {
    if (!session.value?.taskActive) draft.value = content;
  }
}

async function decideApproval(approvalId: string, decision: "approve" | "reject") {
  if (!approvalId || approvalProcessing.value) return;
  approvalProcessing.value = true;
  try {
    await resolveWorkspaceAssistantApproval(approvalId, decision, ownedScope);
  } finally {
    approvalProcessing.value = false;
  }
}

function clearError() {
  if (!session.value) return;
  session.value.errorCode = "";
  session.value.errorText = "";
  session.value.chat.clearError();
}

watch(
  [loggedIn, currentSite, currentAccountId, orgId],
  ([isLoggedIn, site, accountId, organizationId]) => {
    if (!isLoggedIn || ![site, accountId, organizationId].some(Boolean)) {
      automation.clearAssetSelectionRequest();
      if (ownedScope) disposeWorkspaceAssistantSession(ownedScope);
      ownedScope = "";
      session.value = null;
      return;
    }
    replaceSession();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  automation.clearAssetSelectionRequest();
  if (ownedScope) disposeWorkspaceAssistantSession(ownedScope);
});

onDeactivated(() => {
  automation.clearAssetSelectionRequest();
  if (ownedScope) interruptWorkspaceAssistant(ownedScope);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
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
      <AiPresenceHeader
        :assistant-name="assistantName"
        :description="t('RightPanel.WorkspaceAssistantDescription')"
        :status-label="statusLabel"
        :status-tone="statusTone"
        :busy="running"
        :context-items="contextItems"
        :tool-names="session.agent.state.toolNames"
      />

      <WorkspaceAssistantTimeline
        :messages="messages"
        :assistant-name="assistantName"
        :approval-processing="approvalProcessing"
        @decide-approval="decideApproval"
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
        <AiComposer
          v-model="draft"
          :show-policy="false"
          :busy="busy || !available || approvalProcessing"
          :running="running"
          :action-label="t('RightPanel.AISend')"
          :interrupt-label="t('RightPanel.AIInterrupt')"
          :placeholder="t('RightPanel.WorkspaceAssistantInputPlaceholder')"
          :approval-threshold="session.approvalMode"
          execution-mode="foreground"
          :threshold-options="[]"
          :mode-options="[]"
          @submit="submit"
          @interrupt="interruptWorkspaceAssistant(ownedScope)"
        />
        <p class="text-center text-[9px] leading-4 text-muted">
          {{ t("RightPanel.WorkspaceAssistantScopeNotice") }}
        </p>
      </footer>
    </template>
  </div>
</template>
