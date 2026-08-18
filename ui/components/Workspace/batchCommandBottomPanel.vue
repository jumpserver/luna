<script setup lang="ts">
import WorkspaceBatchCommandPanel from "~/components/Workspace/batchCommandPanel.vue";

const { t } = useI18n();
const { setOpen } = useBatchCommandPanel();
</script>

<template>
  <section
    id="batch-command-panel"
    aria-labelledby="batch-command-panel-title"
    class="flex h-52 min-h-0 shrink-0 flex-col border-t"
    :style="{
      borderColor: 'var(--app-border)',
      backgroundColor: 'var(--app-panel-bg)',
      color: 'var(--app-fg)'
    }"
  >
    <div
      class="flex h-8 shrink-0 items-center justify-between px-3"
      :style="{ borderBottom: '1px solid var(--app-border)' }"
    >
      <div class="flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
        <UIcon name="i-lucide-terminal" class="size-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
        <span id="batch-command-panel-title" class="truncate">{{ t("RightPanel.BatchCommand") }}</span>
      </div>
      <button
        type="button"
        class="grid size-6 place-items-center rounded-md text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/8 dark:hover:text-gray-200"
        :aria-label="t('RightPanel.BatchPanelClose')"
        @click="setOpen(false)"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden">
      <WorkspaceBatchCommandPanel />
    </div>
  </section>
</template>
