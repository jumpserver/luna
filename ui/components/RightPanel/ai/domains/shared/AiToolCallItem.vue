<script setup lang="ts">
import type { AgentToolItem, AgentToolStatus } from "../../types";
import { formatAiDuration } from "../../presentation";

defineProps<{
  item: AgentToolItem;
}>();

const { t } = useI18n();

function statusLabel(status: AgentToolStatus) {
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
  </section>
</template>
