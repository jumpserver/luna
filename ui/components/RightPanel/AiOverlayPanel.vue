<script setup lang="ts">
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const isNarrowScreen = useMediaQuery("(max-width: 767px)");
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-50">
    <button
      v-if="isNarrowScreen"
      type="button"
      class="pointer-events-auto absolute inset-0 bg-black/35 backdrop-blur-[1px]"
      :aria-label="t('RightPanel.AIClose')"
      @click="emit('close')"
    />

    <aside
      class="pointer-events-auto absolute inset-y-0 right-0 flex w-[min(380px,calc(100vw-3rem))] min-h-0 flex-col border-l border-[var(--app-border)] bg-[var(--app-panel-bg)] text-[var(--app-fg)] shadow-2xl"
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--app-border)] px-3">
        <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ t("RightPanel.AI") }}</span>
        <UButton
          icon="i-lucide-x"
          :aria-label="t('RightPanel.AIClose')"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="emit('close')"
        />
      </div>

      <div class="min-h-0 flex-1 overflow-hidden">
        <RightPanelAiPanel />
      </div>
    </aside>
  </div>
</template>
