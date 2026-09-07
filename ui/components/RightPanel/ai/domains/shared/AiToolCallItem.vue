<script setup lang="ts">
import type { AgentToolItem, AgentToolStatus } from "../../types";
import { formatAiDuration } from "../../presentation";

const props = defineProps<{
  item: AgentToolItem;
  label?: string;
}>();

const { t } = useI18n();
const open = ref(false);
const commandPreview = computed(() => {
  const args = props.item.data.arguments;
  return args && typeof args === "object" && "command" in args && typeof args.command === "string" ? args.command : "";
});
const errorMessage = computed(() => {
  const error = props.item.data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "";
});

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
  <section class="min-w-0 text-[11px]">
    <UCollapsible v-model:open="open" :disabled="!hasArguments && !hasResult">
      <UButton
        color="neutral"
        variant="ghost"
        block
        class="min-w-0 justify-start gap-1.5 px-1 py-1.5 font-normal"
        :title="commandPreview || item.data.toolName"
      >
        <UIcon :name="statusIcon(item.data.status)" class="size-3.5 shrink-0" :class="statusClass(item.data.status)" />
        <span v-if="!label" class="shrink-0 text-[11px] text-muted">
          {{ t(commandPreview ? "RightPanel.AICommand" : "RightPanel.AIToolCall") }}
        </span>
        <span class="min-w-0 flex-1 truncate text-left text-[11px] text-muted" :class="{ 'font-mono': !label }">
          {{ label || commandPreview || item.data.toolName }}
        </span>
        <span class="shrink-0 text-[10px] text-muted">{{ statusLabel(item.data.status) }}</span>
        <UIcon
          v-if="hasArguments || hasResult"
          name="i-lucide-chevron-right"
          class="size-3 shrink-0 text-muted transition-transform"
          :class="{ 'rotate-90': open }"
        />
      </UButton>
      <template #content>
        <div class="mt-1 space-y-2 rounded-lg border border-default p-2.5">
          <div class="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <code>{{ item.data.toolName }}</code>
            <span v-if="Number(item.data.durationMs) > 0">
              {{ t("RightPanel.AIToolDuration") }} {{ formatAiDuration(item.data.durationMs) }}
            </span>
          </div>
          <div v-if="hasArguments" class="min-w-0">
            <div class="mb-1 text-[10px] font-medium text-muted">{{ t("RightPanel.AIToolArguments") }}</div>
            <pre class="tool-payload" tabindex="0">{{ argumentsText }}</pre>
          </div>
          <div v-if="hasResult" class="min-w-0">
            <div class="mb-1 text-[10px] font-medium text-muted">{{ t("RightPanel.AIToolResult") }}</div>
            <pre class="tool-payload" tabindex="0">{{ resultText }}</pre>
          </div>
        </div>
      </template>
    </UCollapsible>
    <p v-if="item.data.status === 'timeout' || item.data.status === 'unknown'" class="mt-1 pl-5 text-warning">
      {{ t(item.data.status === "timeout" ? "RightPanel.AIToolTimeout" : "RightPanel.AIToolResultUnknown") }}
    </p>
    <p v-else-if="item.data.status === 'error' && errorMessage" class="mt-1 pl-5 text-error [overflow-wrap:anywhere]">
      {{ errorMessage }}
    </p>
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
  font-size: 0.6875rem;
  line-height: 1.5;
}
</style>
