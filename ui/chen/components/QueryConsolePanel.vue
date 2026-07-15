<script setup lang="ts">
import type { ChenQueryConsoleTab, ChenQueryResultTab } from "~/chen/types";

import QueryResultTabs from "~/chen/components/QueryResultTabs.vue";
import ChenSqlEditor from "~/chen/components/SqlEditor.client.vue";

const props = defineProps<{
  tab: ChenQueryConsoleTab
  contextLabel: string
}>();

const emit = defineEmits<{
  run: [tab: ChenQueryConsoleTab, selectedSql: string]
  cancel: [tab: ChenQueryConsoleTab]
  download: [result: ChenQueryResultTab]
  updateStatement: [tab: ChenQueryConsoleTab, value: string]
  activateResult: [tab: ChenQueryConsoleTab, id: string]
  closeResult: [tab: ChenQueryConsoleTab, title: string]
}>();

const sqlEditor = ref<{ selectedText: () => string } | null>(null);

const messageColor = computed(() => {
  if (props.tab.message?.type === "error") return "error";
  if (props.tab.message?.type === "success") return "success";
  return "primary";
});

const statementValue = computed({
  get: () => props.tab.statement,
  set: (value: string) => emit("updateStatement", props.tab, value)
});

function runSelectedQuery() {
  emit("run", props.tab, sqlEditor.value?.selectedText() || "");
}
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
    <div class="relative min-h-0 border-b border-default p-3">
      <div class="mb-2 flex items-center gap-2">
        <UButton
          icon="i-lucide-play"
          size="sm"
          :loading="Boolean(tab.state.inQuery)"
          :disabled="Boolean(tab.state.loading || tab.state.inQuery)"
          @click="runSelectedQuery"
        />
        <UButton
          icon="i-lucide-square"
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="!tab.state.canCancel"
          @click="emit('cancel', tab)"
        />
        <UBadge color="neutral" variant="subtle">
          {{ tab.state.currentContext || contextLabel || 'Context' }}
        </UBadge>
      </div>
      <ChenSqlEditor
        ref="sqlEditor"
        v-model="statementValue"
        class="h-[calc(100%-2rem)]"
        :read-only="Boolean(tab.state.loading)"
        @run="runSelectedQuery"
        @stop="emit('cancel', tab)"
      />
      <div
        v-if="tab.state.loading"
        class="absolute inset-x-3 bottom-3 top-11 grid place-items-center rounded-md bg-default/65"
      >
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
      </div>
    </div>

    <div class="flex min-h-0 flex-col">
      <UAlert
        v-if="tab.message"
        class="m-2 shrink-0"
        :color="messageColor"
        variant="subtle"
        :title="tab.message.title || 'Message'"
        :description="tab.message.message"
      />
      <QueryResultTabs
        class="min-h-0 flex-1"
        :result-tabs="tab.resultTabs"
        :active-result-tab-id="tab.activeResultTabId"
        closable
        :logs="tab.logs"
        show-logs
        empty-message="Run a query to open results here."
        @update:active-result-tab-id="emit('activateResult', tab, $event)"
        @close="emit('closeResult', tab, $event)"
        @download="emit('download', $event)"
      />
    </div>
  </div>
</template>
