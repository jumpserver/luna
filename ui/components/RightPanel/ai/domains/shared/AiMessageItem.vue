<script setup lang="ts">
import type { AiTimelineAction, SharedViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { formatAiDuration, renderAiMarkdown } from "../../presentation";
import AiToolCallItem from "./AiToolCallItem.vue";

defineProps<{
  item: SharedViewItem;
  assistantName: string;
  session?: WorkspaceAiSession;
}>();

defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();
</script>

<template>
  <AiToolCallItem v-if="item.kind === 'agent-tool'" :item="item" />

  <UAlert
    v-else-if="item.kind === 'agent-notice'"
    color="warning"
    variant="subtle"
    icon="i-lucide-clock"
    :description="
      t(
        item.code === 'approval_expired'
          ? 'RightPanel.AIApprovalExpired'
          : item.code === 'tool_result_failed'
            ? 'RightPanel.AIToolResultUnknown'
            : 'RightPanel.AIRunTimeout'
      )
    "
  />

  <article v-else class="message" :class="item.role === 'user' ? 'message-user' : 'message-assistant'">
    <div v-if="item.role !== 'user'" class="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted">
      <UIcon name="i-lucide-sparkles" class="size-3.5 text-primary" />
      <span>{{ assistantName }}</span>
      <UTooltip
        v-if="Number(item.modelDurationMs) > 0"
        :text="`${t('RightPanel.AIModelDuration')} ${formatAiDuration(item.modelDurationMs)}`"
      >
        <UButton
          icon="i-lucide-clock-3"
          color="neutral"
          variant="ghost"
          size="xs"
          class="ml-auto p-0.5 text-muted"
          :aria-label="`${t('RightPanel.AIModelDuration')} ${formatAiDuration(item.modelDurationMs)}`"
        />
      </UTooltip>
    </div>
    <div class="markdown-body" v-html="renderAiMarkdown(item.text)" />
  </article>
</template>

<style scoped>
.message {
  min-width: 0;
  font-size: 0.8125rem;
}

.message-user {
  width: fit-content;
  max-width: 90%;
  margin-left: auto;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--app-border);
  border-radius: 0.875rem 0.875rem 0.25rem 0.875rem;
  background: var(--app-card-bg-soft);
}

.message-assistant {
  padding: 0.25rem 0;
}

.markdown-body {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.75;
  color: var(--app-fg);
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.75rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.625rem 0;
  padding-left: 1.4rem;
  list-style: revert;
}

.markdown-body :deep(li + li) {
  margin-top: 0.375rem;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1.125rem 0 0.5rem;
  font-size: 1em;
  font-weight: 650;
  line-height: 1.5;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2) {
  font-size: 1.08em;
}

.markdown-body :deep(hr) {
  margin: 1rem 0;
  border-color: var(--app-border);
}

.markdown-body :deep(a) {
  color: var(--ui-primary);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  padding: 0.05rem 0.25rem;
  border-radius: 0.25rem;
  color: var(--ui-primary);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  overflow: auto;
  max-height: 24rem;
  margin: 0.75rem 0;
  padding: 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg-soft);
  white-space: pre;
  overflow-wrap: normal;
  line-height: 1.6;
}

.markdown-body :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.markdown-body :deep(blockquote) {
  margin: 0.75rem 0;
  padding-left: 0.75rem;
  border-left: 2px solid var(--ui-primary);
  color: var(--app-muted);
}

.markdown-body :deep(table) {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  margin: 0.75rem 0;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.markdown-body :deep(th) {
  background: var(--app-card-bg-soft);
  font-weight: 600;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  min-width: 5rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--app-border);
  text-align: left;
}
</style>
