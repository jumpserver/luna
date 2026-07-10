<script setup lang="ts">
import type { ChenQueryResultTab } from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";

const props = defineProps<{
  resultTabs: ChenQueryResultTab[]
  activeResultTabId: string
  emptyMessage: string
}>();

const emit = defineEmits<{
  "update:activeResultTabId": [id: string]
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
          v-for="result in resultTabs"
          :key="result.id"
          class="rounded-md px-2 py-1 text-xs"
          :class="activeResultTabId === result.id ? 'bg-accented' : 'text-muted'"
          @click="emit('update:activeResultTabId', result.id)"
        >
          {{ result.title }}
        </button>
      </div>
    </div>

    <div v-if="!resultTabs.length" class="grid min-h-0 flex-1 place-items-center px-6 text-sm text-muted">
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
