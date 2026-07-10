<script setup lang="ts">
import type { ChenQueryConsoleTab, ChenQueryResultTab } from "~/chen/types";

import QueryResultTabs from "~/chen/components/QueryResultTabs.vue";
import ChenSqlEditor from "~/chen/components/SqlEditor.client.vue";

const props = defineProps<{
  tab: ChenQueryConsoleTab
  contextLabel: string
}>();

const emit = defineEmits<{
  run: [tab: ChenQueryConsoleTab]
  cancel: [tab: ChenQueryConsoleTab]
  download: [result: ChenQueryResultTab]
  updateStatement: [tab: ChenQueryConsoleTab, value: string]
  activateResult: [tab: ChenQueryConsoleTab, id: string]
}>();

const statementValue = computed({
  get: () => props.tab.statement,
  set: (value: string) => emit("updateStatement", props.tab, value)
});
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
    <div class="min-h-0 border-b border-default p-3">
      <div class="mb-2 flex items-center gap-2">
        <UButton icon="i-lucide-play" size="sm" @click="emit('run', tab)" />
        <UButton icon="i-lucide-square" size="sm" color="neutral" variant="soft" @click="emit('cancel', tab)" />
        <UBadge color="neutral" variant="subtle">
          {{ tab.state.currentContext || contextLabel || 'Context' }}
        </UBadge>
      </div>
      <ChenSqlEditor
        v-model="statementValue"
        class="h-[calc(100%-2rem)]"
        @run="emit('run', tab)"
        @stop="emit('cancel', tab)"
      />
    </div>

    <QueryResultTabs
      :result-tabs="tab.resultTabs"
      :active-result-tab-id="tab.activeResultTabId"
      empty-message="Run a query to open results here."
      @update:active-result-tab-id="emit('activateResult', tab, $event)"
      @download="emit('download', $event)"
    />
  </div>
</template>
