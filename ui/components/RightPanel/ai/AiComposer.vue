<script setup lang="ts">
import type { AiContextItem, AiSelectOption } from "./types";

defineProps<{
  showPolicy: boolean;
  busy: boolean;
  running: boolean;
  actionLabel: string;
  interruptLabel: string;
  placeholder: string;
  approvalThreshold: number | string;
  executionMode: string;
  thresholdOptions: AiSelectOption[];
  modeOptions: AiSelectOption[];
  contextItems: AiContextItem[];
}>();

const emit = defineEmits<{
  submit: [];
  interrupt: [];
  updateApprovalThreshold: [value: unknown];
  updateExecutionMode: [value: unknown];
}>();

const model = defineModel<string>({ required: true });
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="contextItems.length" class="flex min-w-0 items-start gap-2">
      <span class="flex h-[1.375rem] shrink-0 items-center gap-1 text-[10px] font-medium text-muted">
        <UIcon name="i-lucide-scan-eye" class="size-3" />
        {{ $t("RightPanel.AIContext") }}
      </span>
      <div class="ai-context-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
        <span v-for="item in contextItems" :key="item.key" class="ai-context-chip" :title="item.title">
          <UIcon :name="item.icon" class="size-3 shrink-0" />
          <span class="max-w-28 truncate">{{ item.label }}</span>
        </span>
      </div>
    </div>

    <UChatPrompt
      v-model="model"
      variant="outline"
      size="xs"
      :rows="1"
      :maxrows="5"
      :placeholder="placeholder"
      :disabled="busy"
      :autofocus="false"
      :ui="{ root: 'bg-[var(--app-input-bg)]', base: 'text-xs' }"
      @submit="!running && emit('submit')"
    >
      <template #footer>
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <template v-if="showPolicy">
            <USelect
              v-if="thresholdOptions.length"
              size="xs"
              variant="soft"
              icon="i-lucide-shield-check"
              class="min-w-0 max-w-36"
              :model-value="approvalThreshold"
              :items="thresholdOptions"
              :portal="true"
              value-key="value"
              label-key="label"
              :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
              @update:model-value="emit('updateApprovalThreshold', $event)"
            />
            <USelect
              v-if="modeOptions.length"
              size="xs"
              variant="soft"
              icon="i-lucide-git-branch"
              class="min-w-0 max-w-32"
              :model-value="executionMode"
              :items="modeOptions"
              :portal="true"
              value-key="value"
              label-key="label"
              :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
              @update:model-value="emit('updateExecutionMode', $event)"
            />
          </template>
        </div>
        <UTooltip :text="running ? interruptLabel : actionLabel">
          <UChatPromptSubmit
            size="xs"
            color="primary"
            :status="running ? 'streaming' : 'ready'"
            streaming-icon="i-fluent-stop-16-filled"
            streaming-color="primary"
            streaming-variant="solid"
            :ui="{ leadingIcon: running ? 'size-4 scale-75' : '' }"
            :disabled="busy || !model.trim()"
            :aria-label="running ? interruptLabel : actionLabel"
            @stop.stop="emit('interrupt')"
          />
        </UTooltip>
      </template>
    </UChatPrompt>
  </div>
</template>

<style scoped>
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

.ai-context-scroll {
  scrollbar-width: none;
}

.ai-context-scroll::-webkit-scrollbar {
  height: 0;
}

.ai-context-scroll:hover,
.ai-context-scroll:focus-within {
  margin-bottom: -4px;
  scrollbar-width: thin;
  scrollbar-color: var(--app-scrollbar-thumb) transparent;
}

.ai-context-scroll:hover::-webkit-scrollbar,
.ai-context-scroll:focus-within::-webkit-scrollbar {
  height: 4px;
}

.ai-context-scroll:hover::-webkit-scrollbar-thumb,
.ai-context-scroll:focus-within::-webkit-scrollbar-thumb {
  background-color: var(--app-scrollbar-thumb);
}

.ai-context-scroll:hover::-webkit-scrollbar-thumb:hover {
  background-color: var(--app-scrollbar-thumb-hover);
}
</style>
