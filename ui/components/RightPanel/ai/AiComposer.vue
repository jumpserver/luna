<script setup lang="ts">
import type { AiSelectOption } from "./types";

defineProps<{
  sql: boolean;
  busy: boolean;
  actionLabel: string;
  placeholder: string;
  approvalThreshold: number;
  executionMode: string;
  thresholdOptions: AiSelectOption[];
  modeOptions: AiSelectOption[];
}>();

const emit = defineEmits<{
  submit: [];
  interrupt: [];
  updateApprovalThreshold: [value: unknown];
  updateExecutionMode: [value: unknown];
}>();

const model = defineModel<string>({ required: true });

function handleSubmitKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  emit("submit");
}
</script>

<template>
  <div class="ai-composer">
    <UTextarea
      v-model="model"
      :rows="2"
      autoresize
      :maxrows="5"
      :placeholder="placeholder"
      variant="none"
      class="block w-full"
      :disabled="busy"
      :ui="{ base: 'min-h-24 rounded-lg pb-11 text-xs' }"
      @keydown.enter.exact="handleSubmitKeydown"
    />
    <div class="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
      <div v-if="!sql" class="flex min-w-0 flex-1 items-center gap-1">
        <USelect
          size="xs"
          variant="soft"
          icon="i-lucide-shield-check"
          class="min-w-0 max-w-36"
          :model-value="approvalThreshold"
          :items="thresholdOptions"
          value-key="value"
          label-key="label"
          :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
          @update:model-value="emit('updateApprovalThreshold', $event)"
        />
        <USelect
          size="xs"
          variant="soft"
          icon="i-lucide-git-branch"
          class="min-w-0 max-w-32"
          :model-value="executionMode"
          :items="modeOptions"
          value-key="value"
          label-key="label"
          :ui="{ content: 'min-w-72', itemDescription: 'whitespace-normal' }"
          @update:model-value="emit('updateExecutionMode', $event)"
        />
      </div>
      <UTooltip :text="actionLabel">
        <UButton
          class="ml-auto"
          size="xs"
          color="primary"
          variant="solid"
          :icon="busy ? 'i-lucide-square' : 'i-lucide-arrow-up'"
          :ui="{ leadingIcon: busy ? 'size-2.5 fill-current stroke-none' : undefined }"
          :aria-label="actionLabel"
          :disabled="!busy && !model.trim()"
          @click="busy ? emit('interrupt') : emit('submit')"
        />
      </UTooltip>
    </div>
  </div>
</template>

<style scoped>
.ai-composer {
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

.ai-composer:focus-within {
  border-color: color-mix(in srgb, var(--ui-color-primary-500) 58%, var(--app-border));
  box-shadow: 0 0 0 2px var(--app-focus-ring);
}
</style>
