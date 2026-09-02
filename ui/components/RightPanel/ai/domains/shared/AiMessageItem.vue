<script setup lang="ts">
import type { AiTimelineAction, SharedViewItem } from "../../types";
import type { WorkspaceAiSession } from "~/composables/useWorkspaceAiSessions";
import { formatAiDuration, renderAiMarkdown } from "../../presentation";
import AiToolCallItem from "./AiToolCallItem.vue";

defineProps<{
  item: SharedViewItem;
  session: WorkspaceAiSession;
  assistantName: string;
}>();

defineEmits<{
  action: [action: AiTimelineAction];
}>();

const { t } = useI18n();
</script>

<template>
  <AiToolCallItem v-if="item.kind === 'agent-tool'" :item="item" />

  <article v-else class="flex gap-2" :class="item.role === 'user' ? 'flex-row-reverse' : ''">
    <span class="grid size-6 shrink-0 place-items-center rounded-md border border-default bg-elevated text-primary">
      <UIcon :name="item.role === 'user' ? 'i-lucide-user-round' : 'i-lucide-sparkles'" class="size-3.5" />
    </span>
    <div class="min-w-0 max-w-[88%]" :class="item.role === 'user' ? 'text-right' : ''">
      <div class="text-[10px] text-muted">
        {{ item.role === "user" ? t("RightPanel.AIYou") : assistantName }}
        <span v-if="item.role === 'assistant' && item.modelDurationMs !== undefined" class="ml-1 font-mono">
          · {{ t("RightPanel.AIModelDuration") }} {{ formatAiDuration(item.modelDurationMs) }}
        </span>
      </div>
      <div
        class="markdown-body mt-1 rounded-xl border border-default px-2.5 py-2 text-left text-xs"
        :class="item.role === 'user' ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-elevated'"
        v-html="renderAiMarkdown(item.text)"
      />
    </div>
  </article>
</template>

<style scoped>
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
