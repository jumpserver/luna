<script setup lang="ts">
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenDataViewExportOptions,
  ChenQueryResultTab
} from "~/chen/types";

import ChenDataGrid from "~/chen/components/DataGrid.client.vue";
import DataViewExportDialog from "~/chen/components/DataViewExportDialog.vue";
import DataViewToolbar from "~/chen/components/DataViewToolbar.vue";

const props = withDefaults(defineProps<{
  resultTabs: ChenQueryResultTab[]
  activeResultTabId: string
  emptyMessage: string
  closable?: boolean
  dataViewActions?: boolean
  logs?: string[]
  showLogs?: boolean
  dbType?: string
  canCopy?: boolean
}>(), {
  closable: false,
  dataViewActions: false,
  logs: () => [],
  showLogs: false,
  dbType: "",
  canCopy: false
});

const emit = defineEmits<{
  "update:activeResultTabId": [id: string]
  close: [title: string]
  dataViewAction: [result: ChenQueryResultTab, action: ChenDataViewAction, data?: ChenDataViewActionData]
}>();

const exportDialogOpen = ref(false);
const exportTarget = ref<ChenQueryResultTab | null>(null);

const activeResult = computed(() => {
  return props.resultTabs.find((item) => item.id === props.activeResultTabId) || null;
});

function emitActiveDataViewAction(action: ChenDataViewAction, data?: number) {
  if (!activeResult.value) return;
  emit("dataViewAction", activeResult.value, action, data);
}

function openExportDialog() {
  if (!activeResult.value) return;
  exportTarget.value = activeResult.value;
  exportDialogOpen.value = true;
}

function submitExport(options: ChenDataViewExportOptions) {
  if (!exportTarget.value) return;
  emit("dataViewAction", exportTarget.value, "export", options);
  exportTarget.value = null;
}
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
        <div class="min-w-0 truncate">
          {{ activeResult.title }}
        </div>
        <div class="flex items-center gap-1">
          <DataViewToolbar
            v-if="dataViewActions"
            :state="activeResult.state"
            pinnable
            @action="emitActiveDataViewAction"
            @export="openExportDialog"
          />
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <ChenDataGrid
          :key="`${activeResult.id}:${activeResult.data?.fields?.map(field => field.name).join(',') || ''}:${activeResult.data?.data?.length || 0}`"
          :dataset="activeResult.data"
          :meta="activeResult.meta"
          :db-type="dbType"
          :can-copy="canCopy"
        />
      </div>
    </div>

    <DataViewExportDialog
      v-if="exportDialogOpen"
      v-model:open="exportDialogOpen"
      @confirm="submitExport"
    />
  </div>
</template>
