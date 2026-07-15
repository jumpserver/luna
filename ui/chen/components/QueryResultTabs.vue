<script setup lang="ts">
import type { ChenQueryResultTab } from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";

const props = withDefaults(defineProps<{
  resultTabs: ChenQueryResultTab[]
  activeResultTabId: string
  emptyMessage: string
  closable?: boolean
  logs?: string[]
  showLogs?: boolean
}>(), {
  closable: false,
  logs: () => [],
  showLogs: false
});

const emit = defineEmits<{
  "update:activeResultTabId": [id: string]
  close: [title: string]
  download: [result: ChenQueryResultTab]
}>();

const activeResult = computed(() => {
  return props.resultTabs.find((item) => item.id === props.activeResultTabId) || null;
});
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="shrink-0 border-b border-default px-2 py-1">
      <div class="flex items-center gap-1">
        <button
          v-if="showLogs"
          class="rounded-md px-2 py-1 text-xs"
          :class="!activeResult ? 'bg-accented' : 'text-muted'"
          @click="emit('update:activeResultTabId', '')"
        >
          Log
        </button>
        <div
          v-for="result in resultTabs"
          :key="result.id"
          class="flex items-center rounded-md text-xs"
          :class="activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
        >
          <button class="px-2 py-1" @click="emit('update:activeResultTabId', result.id)">
            {{ result.title }}
          </button>
          <button
            v-if="closable"
            class="mr-1 rounded p-0.5 hover:bg-elevated"
            :aria-label="`Close ${result.title}`"
            @click="emit('close', result.title)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showLogs && !activeResult && logs.length"
      class="min-h-0 flex-1 overflow-auto bg-[var(--workspace-surface-sub-panel)] p-3 text-xs text-muted"
    >
      <pre class="whitespace-pre-wrap">{{ logs.join('\n') }}</pre>
    </div>

    <div v-else-if="!activeResult" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
      <div class="text-center">
        <UIcon name="i-lucide-table-properties" class="mx-auto mb-2 size-5" />
        <p>{{ emptyMessage }}</p>
      </div>
    </div>

    <div
      v-else-if="activeResult"
      :key="activeResult.id"
      class="flex min-h-0 flex-1 flex-col"
    >
      <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-2 text-sm">
        <div>{{ activeResult.title }}</div>
        <UButton size="xs" icon="i-lucide-download" color="neutral" variant="soft" @click="emit('download', activeResult)" />
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <ChenDataGrid
          :key="`${activeResult.id}:${activeResult.data?.fields?.map(field => field.name).join(',') || ''}:${activeResult.data?.data?.length || 0}`"
          :dataset="activeResult.data"
        />
      </div>
    </div>
  </div>
</template>
