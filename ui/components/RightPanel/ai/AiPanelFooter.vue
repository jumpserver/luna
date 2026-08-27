<script setup lang="ts">
import type { AiPanelDomainPresentation } from "./domains/types";
import AiComposer from "./AiComposer.vue";
import { formatAiDuration } from "./presentation";

defineProps<{
  presentation: AiPanelDomainPresentation;
  backgroundExec: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  interrupt: [];
  clearError: [];
  updateApprovalThreshold: [value: unknown];
  updateExecutionMode: [value: unknown];
}>();

const draft = defineModel<string>({ required: true });
const { t } = useI18n();
</script>

<template>
  <footer class="shrink-0 space-y-2 border-t border-default p-3">
    <div
      v-if="presentation.errorLabel"
      class="flex items-start gap-2 rounded-lg bg-error/10 p-2 text-[11px] text-error"
    >
      <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3 shrink-0" />
      <span class="min-w-0 flex-1">
        <span class="block">{{ presentation.errorLabel }}</span>
        <span v-if="presentation.errorDetail" class="mt-0.5 block break-words text-[10px] opacity-80">
          {{ presentation.errorDetail }}
        </span>
        <span
          v-if="presentation.showElapsedInError && presentation.elapsedDurationMs > 0"
          class="mt-1 flex items-center gap-1 font-mono text-[10px] tabular-nums opacity-80"
        >
          <UIcon name="i-lucide-clock-3" class="size-3" />
          {{ t("RightPanel.SQLAITiming") }} · {{ formatAiDuration(presentation.elapsedDurationMs) }}
        </span>
      </span>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :aria-label="t('koko.actions.close')"
        @click="emit('clearError')"
      />
    </div>

    <div
      v-if="presentation.showRuntimeStatus && (presentation.runtimeStatusLabel || presentation.busy)"
      class="flex items-center gap-1.5 text-[11px] text-muted"
    >
      <UIcon
        :name="presentation.busy ? 'i-lucide-loader-circle' : 'i-lucide-circle-dot'"
        class="size-3"
        :class="{ 'animate-spin': presentation.busy }"
      />
      <span>{{ presentation.runtimeStatusLabel }}</span>
      <span class="ml-auto font-mono tabular-nums text-highlighted">
        {{ formatAiDuration(presentation.elapsedDurationMs) }}
      </span>
    </div>

    <p v-if="!backgroundExec && presentation.backgroundReasonLabel" class="text-[11px] text-muted">
      {{ presentation.backgroundReasonLabel }}
    </p>

    <AiComposer
      v-model="draft"
      :show-policy="presentation.showPolicy"
      :busy="presentation.busy"
      :action-label="presentation.actionLabel"
      :placeholder="presentation.inputPlaceholder"
      :approval-threshold="presentation.approvalThreshold"
      :execution-mode="presentation.executionMode"
      :threshold-options="presentation.thresholdOptions"
      :mode-options="presentation.modeOptions"
      @submit="emit('submit')"
      @interrupt="emit('interrupt')"
      @update-approval-threshold="emit('updateApprovalThreshold', $event)"
      @update-execution-mode="emit('updateExecutionMode', $event)"
    />
  </footer>
</template>
