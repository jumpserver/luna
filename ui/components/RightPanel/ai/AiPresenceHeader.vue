<script setup lang="ts">
import type { AiContextItem } from "./types";

defineProps<{
  assistantName: string;
  description: string;
  statusLabel: string;
  statusTone: "ready" | "active" | "warning" | "error" | "success";
  busy: boolean;
  contextItems: AiContextItem[];
  runProgress?: string;
  riskLabel?: string;
  riskColor?: "success" | "info" | "warning" | "error";
}>();

const { t } = useI18n();
</script>

<template>
  <header class="ai-presence-header">
    <div class="flex min-w-0 items-center gap-2.5">
      <span class="ai-presence" :class="[`ai-presence-${statusTone}`, { 'ai-presence-busy': busy }]">
        <span class="ai-presence-core">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
        </span>
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-xs font-semibold text-highlighted">{{ assistantName }}</span>
          <span class="ai-status-label" :class="`ai-status-label-${statusTone}`">
            <span class="ai-status-dot" />
            {{ statusLabel }}
          </span>
        </div>
        <p class="mt-0.5 truncate text-[10px] text-muted">{{ description }}</p>
      </div>

      <div v-if="runProgress || riskLabel" class="flex shrink-0 flex-col items-end gap-1">
        <UBadge v-if="runProgress" color="neutral" variant="subtle" size="xs" class="font-mono tabular-nums">
          {{ runProgress }}
        </UBadge>
        <UBadge v-if="riskLabel" :color="riskColor || 'warning'" variant="subtle" size="xs">
          {{ riskLabel }}
        </UBadge>
      </div>
    </div>

    <div v-if="contextItems.length" class="ai-context-strip">
      <span class="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted">
        <UIcon name="i-lucide-scan-eye" class="size-3" />
        {{ t("RightPanel.AIContext") }}
      </span>
      <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <span v-for="item in contextItems" :key="item.key" class="ai-context-chip" :title="item.title">
          <UIcon :name="item.icon" class="size-3 shrink-0" />
          <span class="max-w-28 truncate">{{ item.label }}</span>
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.ai-presence-header {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--app-border);
  background: color-mix(in srgb, var(--workspace-surface-header) 86%, transparent);
}

.ai-presence {
  position: relative;
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border: 1px solid color-mix(in srgb, currentColor 32%, var(--app-border));
  border-radius: 999px;
  color: var(--app-muted);
}

.ai-presence::before,
.ai-presence::after {
  position: absolute;
  border: 1px solid currentColor;
  border-radius: 999px;
  content: "";
  opacity: 0.22;
}

.ai-presence::before {
  inset: 0.1875rem;
  border-right-color: transparent;
}

.ai-presence::after {
  inset: 0.375rem;
  border-bottom-color: transparent;
}

.ai-presence-core {
  position: relative;
  z-index: 1;
  display: grid;
  width: 1.25rem;
  height: 1.25rem;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 12%, var(--app-panel-bg));
}

.ai-presence-active {
  color: var(--ui-color-primary-500);
}

.ai-presence-warning {
  color: var(--ui-color-warning-500);
}

.ai-presence-error {
  color: var(--ui-color-error-500);
}

.ai-presence-success {
  color: var(--ui-color-success-500);
}

.ai-presence-busy::before {
  animation: ai-orbit 1.8s linear infinite;
}

.ai-presence-busy::after {
  animation: ai-orbit 1.2s linear infinite reverse;
}

.ai-status-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.625rem;
  color: var(--app-muted);
}

.ai-status-dot {
  width: 0.3125rem;
  height: 0.3125rem;
  flex: none;
  border-radius: 999px;
  background: currentColor;
}

.ai-status-label-active {
  color: var(--ui-color-primary-500);
}

.ai-status-label-warning {
  color: var(--ui-color-warning-500);
}

.ai-status-label-error {
  color: var(--ui-color-error-500);
}

.ai-status-label-success {
  color: var(--ui-color-success-500);
}

.ai-context-strip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}

.ai-context-chip {
  display: inline-flex;
  height: 1.375rem;
  flex: none;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.375rem;
  border: 1px solid var(--app-border);
  border-radius: 0.375rem;
  color: var(--app-muted);
  background: var(--app-card-bg-soft);
  font-family: var(--font-mono);
  font-size: 0.625rem;
}

@keyframes ai-orbit {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-presence-busy::before,
  .ai-presence-busy::after {
    animation: none;
  }
}
</style>
