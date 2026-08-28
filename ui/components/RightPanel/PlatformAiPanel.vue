<script setup lang="ts">
import type { PlatformAiConversation } from "./platform/api";
import type { PlatformAiTrace } from "./platform/usePlatformAi";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { renderAiMarkdown } from "./ai/presentation";
import { usePlatformAi } from "./platform/usePlatformAi";

const { t, locale } = useI18n();
const userInfoStore = useUserInfoStore();
const { currentAccountId, currentSite, loggedIn, orgId } = storeToRefs(userInfoStore);
const {
  conversations,
  assistants,
  selectedAssistantKey,
  activeConversationId,
  currentAssistant,
  visibleMessages,
  traces,
  approval,
  loadingConversations,
  loadingMessages,
  streaming,
  stopping,
  preparing,
  approvalProcessing,
  initialized,
  lastError,
  awaitingApproval,
  recoverableRun,
  busy,
  reset,
  initialize,
  loadMessages,
  selectConversation,
  newConversation,
  selectAssistant,
  sendMessage,
  stopGeneration,
  confirmApproval,
  rejectApproval,
  renameConversation,
  removeConversation
} = usePlatformAi();

const historyOpen = ref(false);
const draft = ref("");
const scrollArea = ref<HTMLElement | null>(null);
const editingConversationId = ref("");
const renameDraft = ref("");
const deleteTarget = shallowRef<PlatformAiConversation | null>(null);
const deleting = ref(false);
const sessionScope = computed(() => `${currentSite.value}:${currentAccountId.value}:${orgId.value}`);
const navigationLocked = computed(() => busy.value || loadingMessages.value);
const initialLoadFailed = computed(() => !initialized.value && !loadingConversations.value && Boolean(lastError.value));
const assistantItems = computed(() =>
  assistants.value.map((assistant) => ({
    label: assistantName(assistant.key, assistant.name),
    value: assistant.key,
    description: assistantDescription(assistant.key, assistant.description || "")
  }))
);
const selectedAssistantModel = computed({
  get: () => selectedAssistantKey.value,
  set: (value: string) => void selectAssistant(value)
});
const suggestions = computed(() => currentAssistant.value.starter_prompts || []);
const actionLabel = computed(() =>
  streaming.value || recoverableRun.value ? t("RightPanel.PlatformAIStop") : t("RightPanel.AISend")
);

const assistantCopy: Record<string, { name: string; description: string }> = {
  general: {
    name: "RightPanel.PlatformAIAssistantGeneral",
    description: "RightPanel.PlatformAIAssistantGeneralDescription"
  },
  management: {
    name: "RightPanel.PlatformAIAssistantManagement",
    description: "RightPanel.PlatformAIAssistantManagementDescription"
  },
  asset: { name: "RightPanel.PlatformAIAssistantAsset", description: "RightPanel.PlatformAIAssistantAssetDescription" },
  session_audit: {
    name: "RightPanel.PlatformAIAssistantAudit",
    description: "RightPanel.PlatformAIAssistantAuditDescription"
  },
  ops: { name: "RightPanel.PlatformAIAssistantOps", description: "RightPanel.PlatformAIAssistantOpsDescription" }
};

function assistantName(key: string, fallback = "") {
  return assistantCopy[key] ? t(assistantCopy[key].name) : fallback || t("RightPanel.PlatformAIName");
}

function assistantDescription(key: string, fallback = "") {
  return assistantCopy[key] ? t(assistantCopy[key].description) : fallback;
}

function conversationTitle(conversation: PlatformAiConversation) {
  return conversation.title || t("RightPanel.PlatformAIUntitledConversation");
}

function formatDate(value?: string) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(locale.value, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function traceIcon(trace: PlatformAiTrace) {
  if (trace.status === "failed") return "i-lucide-circle-x";
  if (trace.status === "running") return "i-lucide-loader-circle";
  if (trace.status === "approval") return "i-lucide-shield-alert";
  if (trace.type === "api_call") return "i-lucide-plug-zap";
  if (trace.type === "web_search") return "i-lucide-globe";
  if (trace.type === "api_search") return "i-lucide-search-code";
  return "i-lucide-circle-check";
}

function traceLabel(trace: PlatformAiTrace) {
  if (trace.type === "progress") return trace.data.content || t("RightPanel.PlatformAIWorking");
  if (trace.type === "api_search") {
    return trace.status === "running"
      ? t("RightPanel.PlatformAISearchingAPI")
      : t("RightPanel.PlatformAIFoundAPI", { count: trace.data.operationCount || 0 });
  }
  if (trace.type === "web_search") return t("RightPanel.PlatformAIWebSearch");
  if (trace.type === "error") return trace.data.detail || trace.data.code || t("RightPanel.PlatformAIFailed");
  return (
    trace.data.summary ||
    [trace.data.method, trace.data.path].filter(Boolean).join(" ") ||
    trace.data.action ||
    t("RightPanel.PlatformAICoreAPI")
  );
}

function approvalPreview() {
  if (approval.value?.preview === undefined || approval.value?.preview === null) return "";
  if (typeof approval.value.preview === "string") return approval.value.preview;
  try {
    return JSON.stringify(approval.value.preview, null, 2);
  } catch {
    return String(approval.value.preview);
  }
}

function approvalColor() {
  const risk = String(approval.value?.risk_level || "").toLowerCase();
  if (["dangerous", "high", "critical"].includes(risk)) return "error" as const;
  return "warning" as const;
}

async function submit() {
  const content = draft.value.trim();
  if (!content || busy.value) return;
  draft.value = "";
  const sent = await sendMessage(content);
  if (!sent && !streaming.value) draft.value = content;
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  void submit();
}

function chooseSuggestion(value: string) {
  draft.value = value;
}

function handleNewConversation() {
  if (!newConversation()) return;
  historyOpen.value = false;
  draft.value = "";
}

async function handleSelectConversation(id: string) {
  if (navigationLocked.value) return;
  const selected = await selectConversation(id);
  if (selected) historyOpen.value = false;
}

function beginRename(conversation: PlatformAiConversation) {
  editingConversationId.value = conversation.id;
  renameDraft.value = conversationTitle(conversation);
}

async function submitRename(conversation: PlatformAiConversation) {
  const title = renameDraft.value.trim();
  if (!title) return;
  if (await renameConversation(conversation.id, title)) editingConversationId.value = "";
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return;
  deleting.value = true;
  try {
    if (await removeConversation(deleteTarget.value.id)) deleteTarget.value = null;
  } finally {
    deleting.value = false;
  }
}

async function retry() {
  if (activeConversationId.value) await loadMessages(activeConversationId.value);
  else await initialize(sessionScope.value);
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollArea.value) scrollArea.value.scrollTop = scrollArea.value.scrollHeight;
  });
}

watch(
  [loggedIn, sessionScope],
  ([isLoggedIn, scope]) => {
    if (isLoggedIn) void initialize(scope);
    else reset();
  },
  { immediate: true }
);
watch(() => [visibleMessages.value.length, visibleMessages.value.at(-1)?.content, streaming.value], scrollToBottom);
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col overflow-hidden">
    <div v-if="historyOpen" class="absolute inset-0 z-20 flex min-h-0 flex-col bg-[var(--app-panel-bg)]">
      <div class="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-3">
        <span class="min-w-0 flex-1 truncate text-xs font-semibold">{{ t("RightPanel.PlatformAIHistory") }}</span>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :aria-label="t('Common.Close')"
          @click="historyOpen = false"
        />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div v-if="loadingConversations" class="space-y-2 p-1">
          <USkeleton v-for="item in 5" :key="item" class="h-12 w-full" />
        </div>
        <UEmpty
          v-else-if="!conversations.length"
          icon="i-lucide-message-square-dashed"
          size="sm"
          variant="naked"
          :title="t('RightPanel.PlatformAINoHistory')"
        />
        <div v-else class="space-y-1">
          <div
            v-for="conversation in conversations"
            :key="conversation.id"
            class="group flex min-h-12 items-center gap-1 rounded-lg border px-2 py-1.5"
            :class="
              conversation.id === activeConversationId
                ? 'border-primary/40 bg-primary/10'
                : 'border-transparent hover:border-[var(--app-border)] hover:bg-[var(--app-surface-card)]'
            "
          >
            <UInput
              v-if="editingConversationId === conversation.id"
              v-model="renameDraft"
              size="xs"
              autofocus
              class="min-w-0 flex-1"
              @keydown.enter.prevent.stop="submitRename(conversation)"
              @keydown.esc.prevent.stop="editingConversationId = ''"
            />
            <button
              v-else
              type="button"
              class="min-w-0 flex-1 text-left"
              :disabled="navigationLocked"
              @click="handleSelectConversation(conversation.id)"
            >
              <div class="truncate text-xs font-medium">{{ conversationTitle(conversation) }}</div>
              <div class="mt-0.5 truncate text-[10px] text-muted">{{ formatDate(conversation.date_updated) }}</div>
            </button>
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              class="opacity-60 hover:opacity-100"
              :aria-label="t('RightPanel.PlatformAIRename')"
              :disabled="navigationLocked"
              @click="beginRename(conversation)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              class="opacity-60 hover:opacity-100"
              :aria-label="t('RightPanel.PlatformAIDelete')"
              :disabled="navigationLocked && conversation.id === activeConversationId"
              @click="deleteTarget = conversation"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="loadingMessages || (!initialized && loadingConversations)" class="min-h-0 flex-1 space-y-4 p-4">
      <div v-for="item in 3" :key="item" class="flex gap-2">
        <USkeleton class="size-6 shrink-0 rounded-md" />
        <div class="w-4/5 space-y-2">
          <USkeleton class="h-3 w-20" />
          <USkeleton class="h-12 w-full" />
        </div>
      </div>
    </div>

    <div v-else-if="initialLoadFailed" class="grid min-h-0 flex-1 place-items-center p-5">
      <div class="max-w-72 text-center">
        <UIcon name="i-lucide-bot-off" class="mx-auto size-8 text-muted" />
        <h2 class="mt-3 text-sm font-semibold">{{ t("RightPanel.PlatformAIUnavailableTitle") }}</h2>
        <p class="mt-1 text-xs leading-5 text-muted">{{ t("RightPanel.PlatformAIUnavailableDescription") }}</p>
        <p v-if="lastError?.message" class="mt-2 break-words text-[10px] text-muted">{{ lastError.message }}</p>
        <UButton class="mt-3" size="xs" color="neutral" variant="soft" @click="retry">
          {{ t("RightPanel.PlatformAIRetry") }}
        </UButton>
      </div>
    </div>

    <div v-else ref="scrollArea" class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <div v-if="!visibleMessages.length" class="mx-auto flex min-h-full max-w-80 flex-col justify-center py-6">
        <span class="grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <UIcon name="i-lucide-sparkles" class="size-5" />
        </span>
        <h2 class="mt-3 text-base font-semibold">{{ t("RightPanel.PlatformAIWelcomeTitle") }}</h2>
        <p class="mt-1 text-xs leading-5 text-muted">
          {{ assistantDescription(currentAssistant.key, currentAssistant.description) }}
        </p>
        <div v-if="suggestions.length" class="mt-4 space-y-2">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="flex w-full items-start gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-card)] px-3 py-2 text-left text-xs leading-5 transition-colors hover:border-primary/40 hover:bg-primary/5"
            @click="chooseSuggestion(suggestion)"
          >
            <UIcon name="i-lucide-arrow-up-right" class="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{{ suggestion }}</span>
          </button>
        </div>
      </div>

      <div v-else class="space-y-4">
        <article
          v-for="message in visibleMessages"
          :key="message.id"
          class="flex gap-2"
          :class="message.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <span
            class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary"
          >
            <UIcon :name="message.role === 'user' ? 'i-lucide-user-round' : 'i-lucide-sparkles'" class="size-3.5" />
          </span>
          <div class="min-w-0 max-w-[88%]" :class="message.role === 'user' ? 'text-right' : ''">
            <div class="text-[10px] text-muted">
              {{
                message.role === "user"
                  ? t("RightPanel.AIYou")
                  : assistantName(currentAssistant.key, currentAssistant.name)
              }}
            </div>
            <div
              v-if="message.content"
              class="markdown-body mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
              :class="message.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
              v-html="renderAiMarkdown(message.content)"
            />
            <div
              v-else-if="message.role === 'assistant' && message.status === 'streaming'"
              class="mt-1 flex items-center gap-2 rounded-xl rounded-tl-sm border border-default bg-elevated px-3 py-2 text-xs text-muted"
            >
              <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin text-primary" />
              {{ t("RightPanel.PlatformAIWorking") }}
            </div>
            <details v-if="traces[message.id]?.length" class="mt-1 text-left text-[10px] text-muted">
              <summary class="cursor-pointer select-none py-1 hover:text-default">
                {{ t("RightPanel.PlatformAIActivity", { count: traces[message.id]?.length || 0 }) }}
              </summary>
              <div class="space-y-1 border-l border-[var(--app-border)] pl-2">
                <div v-for="trace in traces[message.id]" :key="trace.id" class="flex items-start gap-1.5 py-0.5">
                  <UIcon
                    :name="traceIcon(trace)"
                    class="mt-0.5 size-3 shrink-0"
                    :class="trace.status === 'running' ? 'animate-spin text-primary' : ''"
                  />
                  <span class="min-w-0 break-words">{{ traceLabel(trace) }}</span>
                </div>
              </div>
            </details>
            <p v-if="message.error" class="mt-1 text-left text-[10px] text-error">{{ message.error }}</p>
          </div>
        </article>

        <UAlert
          v-if="approval"
          icon="i-lucide-shield-alert"
          :color="approvalColor()"
          variant="subtle"
          :title="t('RightPanel.PlatformAIApprovalTitle')"
        >
          <template #description>
            <div class="mt-2 space-y-2 text-xs">
              <p>{{ t("RightPanel.PlatformAIApprovalDescription") }}</p>
              <div class="rounded-md border border-default bg-default/40 px-2 py-1.5 font-mono">
                {{ [approval.method, approval.path].filter(Boolean).join(" ") }}
              </div>
              <pre
                v-if="approvalPreview()"
                class="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-elevated p-2 text-[10px]"
                >{{ approvalPreview() }}</pre>
              <div class="flex justify-end gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="approvalProcessing"
                  @click="void rejectApproval()"
                >
                  {{ t("RightPanel.AIReject") }}
                </UButton>
                <UButton
                  size="xs"
                  :color="approvalColor()"
                  :loading="approvalProcessing"
                  @click="void confirmApproval()"
                >
                  {{ t("RightPanel.AIApprove") }}
                </UButton>
              </div>
            </div>
          </template>
        </UAlert>

        <UAlert
          v-else-if="recoverableRun"
          icon="i-lucide-clock-3"
          color="warning"
          variant="subtle"
          :title="t('RightPanel.PlatformAIRunContinuing')"
        >
          <template #actions>
            <UButton size="xs" color="warning" variant="soft" :loading="stopping" @click="stopGeneration">
              {{ t("RightPanel.PlatformAIStop") }}
            </UButton>
          </template>
        </UAlert>

        <UAlert
          v-else-if="awaitingApproval"
          icon="i-lucide-shield-question"
          color="warning"
          variant="subtle"
          :title="t('RightPanel.PlatformAIApprovalRecovery')"
        >
          <template #actions>
            <UButton size="xs" color="warning" variant="soft" :loading="stopping" @click="stopGeneration">
              {{ t("RightPanel.PlatformAIStop") }}
            </UButton>
          </template>
        </UAlert>
      </div>
    </div>

    <div class="shrink-0 border-t border-[var(--app-border)] p-2.5">
      <p v-if="lastError && initialized" class="mb-2 line-clamp-2 text-[10px] text-error" role="alert">
        {{ lastError.message }}
      </p>
      <div class="mb-2 flex items-center gap-1.5">
        <UTooltip :text="t('RightPanel.PlatformAIHistory')">
          <UButton
            icon="i-lucide-panel-left"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('RightPanel.PlatformAIHistory')"
            @click="historyOpen = true"
          />
        </UTooltip>
        <USelect
          v-model="selectedAssistantModel"
          :items="assistantItems"
          value-key="value"
          label-key="label"
          size="xs"
          variant="soft"
          icon="i-lucide-bot"
          class="min-w-0 flex-1"
          :disabled="navigationLocked"
          :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
        />
        <UTooltip :text="t('RightPanel.PlatformAINewChat')">
          <UButton
            icon="i-lucide-square-pen"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="t('RightPanel.PlatformAINewChat')"
            :disabled="navigationLocked"
            @click="handleNewConversation"
          />
        </UTooltip>
      </div>
      <div class="platform-ai-composer">
        <UTextarea
          v-model="draft"
          :rows="2"
          autoresize
          :maxrows="5"
          :placeholder="t('RightPanel.PlatformAIInputPlaceholder')"
          variant="none"
          class="block w-full"
          :disabled="awaitingApproval || recoverableRun || preparing"
          :ui="{ base: 'min-h-20 rounded-lg pb-10 text-xs' }"
          @keydown.enter.exact="handleComposerKeydown"
        />
        <div class="absolute inset-x-2 bottom-2 flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate text-[10px] text-muted">
            {{ t("RightPanel.PlatformAIScopeNotice") }}
          </span>
          <UTooltip :text="actionLabel">
            <UButton
              size="xs"
              color="primary"
              variant="solid"
              :icon="streaming || recoverableRun ? 'i-lucide-square' : 'i-lucide-arrow-up'"
              :ui="{ leadingIcon: streaming || recoverableRun ? 'size-2.5 fill-current stroke-none' : undefined }"
              :aria-label="actionLabel"
              :disabled="!streaming && !recoverableRun && !draft.trim()"
              :loading="preparing || stopping"
              @click="streaming || recoverableRun ? stopGeneration() : submit()"
            />
          </UTooltip>
        </div>
      </div>
      <p class="mt-1.5 text-center text-[9px] leading-4 text-muted">{{ t("RightPanel.PlatformAIDisclaimer") }}</p>
    </div>

    <UModal
      :open="Boolean(deleteTarget)"
      :title="t('RightPanel.PlatformAIDelete')"
      :ui="{ content: 'max-w-md', footer: 'justify-end gap-2' }"
      @update:open="(open) => !open && (deleteTarget = null)"
    >
      <template #body>
        <p class="text-sm text-muted">
          {{
            t("RightPanel.PlatformAIDeleteDescription", { title: deleteTarget ? conversationTitle(deleteTarget) : "" })
          }}
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :disabled="deleting" @click="deleteTarget = null">
          {{ t("Common.Cancel") }}
        </UButton>
        <UButton color="error" :loading="deleting" @click="confirmDelete">
          {{ t("RightPanel.PlatformAIDelete") }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.platform-ai-composer {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 0.625rem;
  background: var(--app-input-bg);
  box-shadow: 0 0 0 1px transparent;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.platform-ai-composer:focus-within {
  border-color: color-mix(in srgb, var(--ui-color-primary-500) 58%, var(--app-border));
  box-shadow: 0 0 0 2px var(--app-focus-ring);
}

.markdown-body {
  overflow-wrap: anywhere;
  line-height: 1.6;
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
