<script setup lang="ts">
import type { AgentToolItem, AgentToolStatus } from "../../types";
import { formatAiDuration } from "../../presentation";

const props = defineProps<{
  item: AgentToolItem;
}>();

const { t } = useI18n();

const hasArguments = computed(() => Object.hasOwn(props.item.data, "arguments"));
const hasResult = computed(() => Object.hasOwn(props.item.data, "result") || Object.hasOwn(props.item.data, "error"));
const argumentsText = computed(() => formatToolValue(props.item.data.arguments));
const resultText = computed(() =>
  formatToolValue(Object.hasOwn(props.item.data, "error") ? props.item.data.error : props.item.data.result)
);

function formatToolValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function statusLabel(status: AgentToolStatus) {
  if (status === "timeout") return t("RightPanel.AIStatusTimeout");
  if (status === "unknown") return t("RightPanel.AIStatusUnknown");
  if (status === "running") return t("RightPanel.AIStatusRunning");
  if (status === "success") return t("RightPanel.AIStatusCompleted");
  if (status === "cancelled") return t("RightPanel.AIStatusCancelled");
  return t("RightPanel.AIStatusFailed");
}

function statusIcon(status: AgentToolStatus) {
  if (status === "running") return "i-lucide-loader-circle";
  if (status === "success") return "i-lucide-circle-check";
  if (status === "cancelled") return "i-lucide-circle-slash";
  return "i-lucide-circle-alert";
}

function statusClass(status: AgentToolStatus) {
  if (status === "timeout" || status === "unknown") return "text-warning";
  if (status === "running") return "animate-spin text-primary";
  if (status === "success") return "text-success";
  if (status === "cancelled") return "text-muted";
  return "text-error";
}
</script>

<template>
  <section class="rounded-xl border border-default bg-elevated/40 px-2.5 py-2 text-[11px]">
    <div class="flex min-w-0 items-center gap-1.5">
      <UIcon :name="statusIcon(item.data.status)" class="size-3.5 shrink-0" :class="statusClass(item.data.status)" />
      <span class="shrink-0 font-medium text-highlighted">{{ t("RightPanel.AIToolCall") }}</span>
      <code v-if="item.data.toolName" class="min-w-0 truncate font-mono text-[10px] text-muted">
        {{ item.data.toolName }}
      </code>
      <span class="ml-auto shrink-0 text-[10px] text-muted">
        {{ statusLabel(item.data.status) }}
      </span>
      <span v-if="Number(item.data.durationMs) > 0" class="shrink-0 font-mono text-[10px] text-muted">
        {{ formatAiDuration(item.data.durationMs || 0) }}
      </span>
    </div>
    <p v-if="item.data.status === 'timeout' || item.data.status === 'unknown'" class="mt-1 text-warning">
      {{ t(item.data.status === "timeout" ? "RightPanel.AIToolTimeout" : "RightPanel.AIToolResultUnknown") }}
    </p>
    <div v-if="hasArguments || hasResult" class="mt-2 space-y-2 border-t border-default pt-2">
      <div v-if="hasArguments" class="min-w-0">
        <div class="mb-1 text-[10px] font-medium text-muted">{{ t("RightPanel.AIToolArguments") }}</div>
        <pre class="tool-payload">{{ argumentsText }}</pre>
      </div>
      <div v-if="hasResult" class="min-w-0">
        <div class="mb-1 text-[10px] font-medium text-muted">{{ t("RightPanel.AIToolResult") }}</div>
        <pre class="tool-payload">{{ resultText }}</pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tool-payload {
  max-height: 12rem;
  overflow: auto;
  margin: 0;
  padding: 0.5rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  background: var(--app-card-bg-soft);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  line-height: 1.5;
}
</style>
