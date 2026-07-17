<script setup lang="ts">
import type { ChenSqlSnippet } from "~/chen/composables/useChenSqlSnippets";
import type { ChenDataViewAction, ChenDataViewActionData, ChenQueryConsoleTab, ChenQueryResultTab } from "~/chen/types";

import QueryResultTabs from "~/chen/components/QueryResultTabs.vue";
import ChenSqlEditor from "~/chen/components/SqlEditor.client.vue";
import SqlSnippetSaveDialog from "~/chen/components/SqlSnippetSaveDialog.vue";
import SqlSnippetSelectDialog from "~/chen/components/SqlSnippetSelectDialog.vue";
import { useChenSqlSnippets } from "~/chen/composables/useChenSqlSnippets";

const props = defineProps<{
  tab: ChenQueryConsoleTab
  contextLabel: string
  dbType: string
  canCopy: boolean
}>();

const emit = defineEmits<{
  run: [tab: ChenQueryConsoleTab, selectedSql: string]
  cancel: [tab: ChenQueryConsoleTab]
  dataViewAction: [tab: ChenQueryConsoleTab, result: ChenQueryResultTab, action: ChenDataViewAction, data?: ChenDataViewActionData]
  dismissMessage: [tab: ChenQueryConsoleTab]
  updateStatement: [tab: ChenQueryConsoleTab, value: string]
  activateResult: [tab: ChenQueryConsoleTab, id: string]
  closeResult: [tab: ChenQueryConsoleTab, title: string]
}>();

const sqlEditor = ref<{ selectedText: () => string } | null>(null);
const hasSelection = ref(false);
const messageOpen = ref(false);
const saveSnippetDialogOpen = ref(false);
const selectSnippetDialogOpen = ref(false);
const DEFAULT_MESSAGE_CLOSE_DELAY_SECONDS = 5;
let messageCloseTimer: ReturnType<typeof setTimeout> | null = null;
const toast = useToast();
const sqlSnippets = useChenSqlSnippets(() => props.dbType);
const queryBusy = computed(() => Boolean(props.tab.state.loading || props.tab.state.inQuery));

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

function requestErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

async function openSnippetDialog() {
  selectSnippetDialogOpen.value = true;
  try {
    await sqlSnippets.load();
  } catch (cause) {
    toast.add({
      title: "Failed to load SQL",
      description: requestErrorMessage(cause),
      color: "error"
    });
  }
}

function openSaveSnippetDialog() {
  saveSnippetDialogOpen.value = true;
}

async function saveSqlSnippet(name: string) {
  try {
    await sqlSnippets.save(name, props.tab.statement);
    toast.add({ title: "Save succeeded", color: "success" });
  } catch (cause) {
    toast.add({
      title: "Failed to save SQL",
      description: requestErrorMessage(cause),
      color: "error"
    });
  } finally {
    saveSnippetDialogOpen.value = false;
  }
}

function insertSqlSnippet(snippet: ChenSqlSnippet) {
  statementValue.value = statementValue.value
    ? `${statementValue.value}\n${snippet.args}`
    : snippet.args;
  selectSnippetDialogOpen.value = false;
}

async function deleteSqlSnippet(snippet: ChenSqlSnippet) {
  try {
    await sqlSnippets.remove(snippet.id);
    toast.add({ title: "Delete succeeded", color: "success" });
  } catch (cause) {
    toast.add({
      title: "Failed to delete SQL",
      description: requestErrorMessage(cause),
      color: "error"
    });
  }
}

function clearMessageTimer() {
  if (messageCloseTimer === null) return;
  clearTimeout(messageCloseTimer);
  messageCloseTimer = null;
}

function dismissMessage() {
  clearMessageTimer();
  messageOpen.value = false;
  if (props.tab.message) emit("dismissMessage", props.tab);
}

function handleMessageOpen(open: boolean) {
  if (!open) dismissMessage();
}

watch(() => props.tab.message, (message) => {
  clearMessageTimer();
  messageOpen.value = Boolean(message);
  if (!message) return;

  const closeDelay = typeof message.closeDelay === "number" && message.closeDelay > 0
    ? message.closeDelay
    : DEFAULT_MESSAGE_CLOSE_DELAY_SECONDS;
  messageCloseTimer = setTimeout(dismissMessage, closeDelay * 1000);
}, { immediate: true });

onBeforeUnmount(clearMessageTimer);
</script>

<template>
  <div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(16rem,42%)]">
    <div class="relative flex min-h-0 flex-col overflow-hidden border-b border-default p-3">
      <div class="mb-2 flex shrink-0 items-center gap-2">
        <UButton
          icon="i-lucide-play"
          size="sm"
          :loading="Boolean(tab.state.inQuery)"
          :disabled="Boolean(tab.state.loading || tab.state.inQuery)"
          @click="runSelectedQuery"
        >
          {{ hasSelection ? "Run selected" : "Run" }}
        </UButton>
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
        <UButton
          icon="i-lucide-folder-open"
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="queryBusy"
          @click="openSnippetDialog"
        >
          Open
        </UButton>
        <UButton
          icon="i-lucide-save"
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="queryBusy"
          @click="openSaveSnippetDialog"
        >
          Save
        </UButton>
      </div>
      <div class="relative flex min-h-0 flex-1">
        <ChenSqlEditor
          ref="sqlEditor"
          v-model="statementValue"
          class="min-h-0 flex-1"
          :read-only="Boolean(tab.state.loading)"
          @selection-change="hasSelection = $event"
          @open-snippets="openSnippetDialog"
          @run="runSelectedQuery"
          @save-snippet="openSaveSnippetDialog"
          @stop="emit('cancel', tab)"
        />
        <div
          v-if="tab.state.loading"
          class="absolute inset-0 z-10 grid place-items-center rounded-md bg-default/65"
        >
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-muted" />
        </div>
        <UAlert
          v-if="tab.message && messageOpen"
          class="absolute bottom-3 left-1/2 z-20 max-h-32 w-3/4 -translate-x-1/2 overflow-y-auto"
          :color="messageColor"
          variant="subtle"
          :title="tab.message.title || 'Message'"
          :description="tab.message.message"
          close
          @update:open="handleMessageOpen"
        />
      </div>
    </div>

    <div class="flex min-h-0 flex-col">
      <QueryResultTabs
        class="min-h-0 flex-1"
        :result-tabs="tab.resultTabs"
        :active-result-tab-id="tab.activeResultTabId"
        closable
        data-view-actions
        :db-type="dbType"
        :can-copy="canCopy"
        :logs="tab.logs"
        show-logs
        empty-message="Run a query to open results here."
        @update:active-result-tab-id="emit('activateResult', tab, $event)"
        @close="emit('closeResult', tab, $event)"
        @data-view-action="(result, action, data) => emit('dataViewAction', tab, result, action, data)"
      />
    </div>

    <SqlSnippetSaveDialog
      v-if="saveSnippetDialogOpen"
      v-model:open="saveSnippetDialogOpen"
      :saving="sqlSnippets.saving.value"
      @confirm="saveSqlSnippet"
    />

    <SqlSnippetSelectDialog
      v-if="selectSnippetDialogOpen"
      v-model:open="selectSnippetDialogOpen"
      :snippets="sqlSnippets.snippets.value"
      :loading="sqlSnippets.loading.value"
      :deleting-id="sqlSnippets.deletingId.value"
      @insert="insertSqlSnippet"
      @delete="deleteSqlSnippet"
    />
  </div>
</template>
