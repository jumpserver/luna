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
    <UChatPrompt
      v-model="model"
      variant="outline"
      size="xs"
      class="ai-composer-prompt"
      :rows="2"
      :maxrows="5"
      :placeholder="placeholder"
      :disabled="busy"
      :autofocus="false"
      :ui="{
        root: 'bg-[var(--app-input-bg)]',
        footer: '-mx-1.5',
        base: 'min-h-8 resize-none overflow-y-auto text-xs'
      }"
      @submit="!running && emit('submit')"
    >
      <template #footer>
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <slot name="context">
            <UPopover v-if="contextItems.length" :content="{ side: 'top', align: 'start' }">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="contextItems[0]?.icon || 'i-lucide-at-sign'"
                trailing-icon="i-lucide-chevron-down"
                :aria-label="$t('RightPanel.AIContext')"
                :title="contextItems.map((item) => item.title).join('\n')"
                class="min-w-16 max-w-full justify-start px-1"
              >
                <span class="min-w-0 truncate">{{ contextItems[0]?.label }}</span>
                <span v-if="contextItems.length > 1" class="shrink-0 text-[10px] text-muted">
                  +{{ contextItems.length - 1 }}
                </span>
              </UButton>
              <template #content>
                <div class="w-64 max-w-[calc(100vw-2rem)] space-y-2 p-3">
                  <p class="text-[10px] font-medium text-muted">{{ $t("RightPanel.AIContext") }}</p>
                  <ul class="space-y-2 text-xs">
                    <li v-for="item in contextItems" :key="item.key" class="flex items-start gap-2">
                      <UIcon :name="item.icon" class="mt-0.5 size-3.5 shrink-0 text-muted" />
                      <span class="min-w-0 break-all">{{ item.title || item.label }}</span>
                    </li>
                  </ul>
                </div>
              </template>
            </UPopover>
          </slot>
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
.ai-composer-prompt :deep(textarea) {
  max-height: min(20rem, 40vh);
}
</style>
