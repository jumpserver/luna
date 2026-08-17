<script setup lang="ts">
import type { ChenSqlSnippet } from "~/chen/composables/useChenSqlSnippets";
import type {
  ChenDataViewAction,
  ChenDataViewActionData,
  ChenQueryConsoleTab,
  ChenQueryResultTab,
  ChenSqlEditorSnapshot
} from "~/chen/types";
import type { ChenSqlMetadataStore } from "~/chen/utils/sqlMetadata";

import QueryResultTabs from "~/chen/components/QueryResultTabs.vue";
import ChenSqlEditor from "~/chen/components/SqlEditor.client.vue";
import SqlSnippetSaveDialog from "~/chen/components/SqlSnippetSaveDialog.vue";
import SqlSnippetSelectDialog from "~/chen/components/SqlSnippetSelectDialog.vue";
import { useChenSqlSnippets } from "~/chen/composables/useChenSqlSnippets";
import { createChenCompletionSource } from "~/chen/utils/sqlCompletion";
import { chenSqlDialect } from "~/chen/utils/sqlEditor";
import { formatChenSql } from "~/chen/utils/sqlFormat";

const props = defineProps<{
  tab: ChenQueryConsoleTab;
  dbType: string;
  canCopy: boolean;
  metadataStore: ChenSqlMetadataStore;
}>();

const emit = defineEmits<{
  run: [tab: ChenQueryConsoleTab, selectedSql: string];
  cancel: [tab: ChenQueryConsoleTab];
  changeContext: [tab: ChenQueryConsoleTab, context: string];
  uploadSql: [tab: ChenQueryConsoleTab, file: File];
  dataViewAction: [
    tab: ChenQueryConsoleTab,
    result: ChenQueryResultTab,
    action: ChenDataViewAction,
    data?: ChenDataViewActionData
  ];
  dismissMessage: [tab: ChenQueryConsoleTab];
  updateStatement: [tab: ChenQueryConsoleTab, value: string];
  aiGenerate: [tab: ChenQueryConsoleTab];
  aiExplain: [tab: ChenQueryConsoleTab];
  aiRepair: [tab: ChenQueryConsoleTab];
  activateResult: [tab: ChenQueryConsoleTab, id: string];
  closeResult: [tab: ChenQueryConsoleTab, title: string];
}>();

const sqlEditor = ref<{
  replaceDocument: (value: string) => void;
  executionText: () => string;
  snapshot: () => ChenSqlEditorSnapshot;
} | null>(null);
const sqlUploadInput = ref<HTMLInputElement | null>(null);
const hasSelection = ref(false);
const messageOpen = ref(false);
const saveSnippetDialogOpen = ref(false);
const selectSnippetDialogOpen = ref(false);
const queryPanel = ref<HTMLElement | null>(null);
const editorHeightRatio = ref(58);
const resizingQueryPanel = ref(false);
const QUERY_PANEL_MIN_RATIO = 20;
const QUERY_PANEL_RESIZE_STEP = 5;
const DEFAULT_MESSAGE_CLOSE_DELAY_SECONDS = 5;
let messageCloseTimer: ReturnType<typeof setTimeout> | null = null;
const toast = useToast();
const { t } = useI18n();
const { addErrorToast } = useErrorToast();
const sqlSnippets = useChenSqlSnippets(() => props.dbType);
const completionSource = createChenCompletionSource({
  store: props.metadataStore,
  scope: () => {
    const context = props.tab.state.currentContext || "";
    return context ? { nodeKey: props.tab.nodeKey, context } : null;
  },
  dialect: () => chenSqlDialect(props.dbType)
});
const queryBusy = computed(() => Boolean(props.tab.state.loading || props.tab.state.inQuery));
const contextBusy = computed(() => Boolean(queryBusy.value || props.tab.state.editorLoading));
const contextItems = computed(() =>
  (props.tab.state.contexts || []).map((context) => ({
    label: context,
    slot: "context" as const,
    checked: context === props.tab.state.currentContext,
    disabled: contextBusy.value || context === props.tab.state.currentContext,
    onSelect: () => emit("changeContext", props.tab, context)
  }))
);
const aiItems = computed(() => {
  const statementEmpty = !props.tab.statement.trim();

  return [
    {
      label: t("RightPanel.SQLAIGenerate"),
      icon: "i-lucide-wand-sparkles",
      disabled: contextBusy.value,
      onSelect: () => emit("aiGenerate", props.tab)
    },
    {
      label: t("RightPanel.SQLAIExplain"),
      icon: "i-lucide-message-square-text",
      disabled: contextBusy.value || statementEmpty,
      onSelect: () => emit("aiExplain", props.tab)
    },
    {
      label: t("RightPanel.SQLAIRepair"),
      icon: "i-lucide-wrench",
      disabled: contextBusy.value || statementEmpty,
      onSelect: () => emit("aiRepair", props.tab)
    }
  ];
});
const sqlFileItems = computed(() => [
  {
    label: "Open",
    icon: "i-lucide-folder-open",
    onSelect: openSnippetDialog
  },
  {
    label: "Save",
    icon: "i-lucide-save",
    onSelect: openSaveSnippetDialog
  },
  {
    label: "Upload SQL",
    icon: "i-lucide-upload",
    onSelect: () => sqlUploadInput.value?.click()
  }
]);
const queryPanelRows = computed(() => ({
  gridTemplateRows: `${editorHeightRatio.value}fr 1px ${100 - editorHeightRatio.value}fr`
}));

const messageColor = computed(() => {
  if (props.tab.message?.type === "error") return "error";
  if (props.tab.message?.type === "success") return "success";
  return "primary";
});

const statementValue = computed({
  get: () => props.tab.statement,
  set: (value: string) => emit("updateStatement", props.tab, value)
});

function runCurrentQuery() {
  emit("run", props.tab, sqlEditor.value?.executionText() || "");
}

function runEditorQuery(sql?: string) {
  emit("run", props.tab, sql || sqlEditor.value?.executionText() || "");
}

function editorSnapshot(): ChenSqlEditorSnapshot {
  return (
    sqlEditor.value?.snapshot() || {
      documentSql: props.tab.statement,
      selectedSql: "",
      selectionFrom: 0,
      selectionTo: 0
    }
  );
}

function formatStatement() {
  if (contextBusy.value) return;
  const original = props.tab.statement;
  try {
    const formatted = formatChenSql(original, props.dbType);
    if (formatted === original) return;
    sqlEditor.value?.replaceDocument(formatted);
  } catch (cause) {
    addErrorToast({
      title: "SQL format failed",
      description: requestErrorMessage(cause)
    });
  }
}

function requestErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}

function handleSqlFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".sql")) {
    addErrorToast({
      title: "SQL upload failed",
      description: "Choose a .sql file."
    });
    return;
  }
  if (file.size === 0) {
    addErrorToast({
      title: "SQL upload failed",
      description: "SQL file is empty."
    });
    return;
  }

  emit("uploadSql", props.tab, file);
}

async function openSnippetDialog() {
  selectSnippetDialogOpen.value = true;
  try {
    await sqlSnippets.load();
  } catch (cause) {
    addErrorToast({
      title: "Failed to load SQL",
      description: requestErrorMessage(cause)
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
    addErrorToast({
      title: "Failed to save SQL",
      description: requestErrorMessage(cause)
    });
  } finally {
    saveSnippetDialogOpen.value = false;
  }
}

function insertSqlSnippet(snippet: ChenSqlSnippet) {
  statementValue.value = statementValue.value ? `${statementValue.value}\n${snippet.args}` : snippet.args;
  selectSnippetDialogOpen.value = false;
}

async function deleteSqlSnippet(snippet: ChenSqlSnippet) {
  try {
    await sqlSnippets.remove(snippet.id);
    toast.add({ title: "Delete succeeded", color: "success" });
  } catch (cause) {
    addErrorToast({
      title: "Failed to delete SQL",
      description: requestErrorMessage(cause)
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

function setEditorHeightRatio(ratio: number) {
  editorHeightRatio.value = Math.min(100 - QUERY_PANEL_MIN_RATIO, Math.max(QUERY_PANEL_MIN_RATIO, ratio));
}

function resizeQueryPanel(event: PointerEvent) {
  if (!resizingQueryPanel.value || !queryPanel.value) return;

  const bounds = queryPanel.value.getBoundingClientRect();
  setEditorHeightRatio(((event.clientY - bounds.top) / bounds.height) * 100);
}

function beginQueryPanelResize(event: PointerEvent) {
  if (event.button !== 0) return;

  resizingQueryPanel.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  resizeQueryPanel(event);
  event.preventDefault();
}

function endQueryPanelResize(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  resizingQueryPanel.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

function resizeQueryPanelWithKeyboard(event: KeyboardEvent) {
  const delta =
    event.key === "ArrowUp" ? -QUERY_PANEL_RESIZE_STEP : event.key === "ArrowDown" ? QUERY_PANEL_RESIZE_STEP : 0;
  if (!delta) return;

  setEditorHeightRatio(editorHeightRatio.value + delta);
  event.preventDefault();
}

watch(
  () => props.tab.message,
  (message) => {
    clearMessageTimer();
    messageOpen.value = Boolean(message);
    if (!message) return;

    const closeDelay =
      typeof message.closeDelay === "number" && message.closeDelay > 0
        ? message.closeDelay
        : DEFAULT_MESSAGE_CLOSE_DELAY_SECONDS;
    messageCloseTimer = setTimeout(dismissMessage, closeDelay * 1000);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearMessageTimer();
  if (!resizingQueryPanel.value) return;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

defineExpose({ editorSnapshot });
</script>

<template>
  <div ref="queryPanel" class="grid h-full min-h-0" :style="queryPanelRows">
    <div class="relative flex min-h-0 flex-col overflow-hidden p-3">
      <div class="mb-2 flex shrink-0 items-center gap-2">
        <UButton
          v-if="tab.state.inQuery || tab.state.canCancel"
          icon="i-lucide-square"
          size="sm"
          color="error"
          :disabled="!tab.state.canCancel"
          @click="emit('cancel', tab)"
        >
          Stop
        </UButton>
        <UButton v-else icon="i-lucide-play" size="sm" :disabled="Boolean(tab.state.loading)" @click="runCurrentQuery">
          {{ hasSelection ? "Run selected" : "Run current" }}
        </UButton>
        <UButton
          icon="i-lucide-align-left"
          size="sm"
          color="neutral"
          variant="soft"
          :disabled="contextBusy"
          @click="formatStatement"
        >
          Format
        </UButton>
        <input ref="sqlUploadInput" type="file" accept=".sql" class="hidden" @change="handleSqlFileChange" />
        <UDropdownMenu :items="sqlFileItems">
          <UButton
            icon="i-lucide-file-text"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
            color="neutral"
            variant="soft"
            :loading="tab.uploadingSql"
            :disabled="queryBusy || tab.uploadingSql"
          >
            SQL
          </UButton>
        </UDropdownMenu>
        <UDropdownMenu :items="aiItems">
          <UButton
            icon="i-lucide-sparkles"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="contextBusy"
          >
            AI
          </UButton>
        </UDropdownMenu>
        <UDropdownMenu
          :items="contextItems"
          :content="{ align: 'end' }"
          :ui="{ content: 'w-max min-w-(--reka-dropdown-menu-trigger-width) max-w-80' }"
        >
          <template #context-trailing="{ item }">
            <UIcon v-if="item.checked" name="i-lucide-check" class="size-4 shrink-0" />
          </template>
          <UButton
            class="ml-auto"
            icon="i-lucide-database"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
            color="neutral"
            variant="soft"
            :disabled="contextBusy || contextItems.length === 0"
          >
            {{ tab.state.currentContext || "Context" }}
          </UButton>
        </UDropdownMenu>
      </div>
      <div class="relative flex min-h-0 flex-1">
        <ChenSqlEditor
          ref="sqlEditor"
          v-model="statementValue"
          class="min-h-0 flex-1"
          :db-type="dbType"
          :completion-source="completionSource"
          :read-only="Boolean(tab.state.loading || tab.state.editorLoading)"
          @selection-change="hasSelection = $event"
          @format="formatStatement"
          @open-snippets="openSnippetDialog"
          @run="runEditorQuery"
          @save-snippet="openSaveSnippetDialog"
          @stop="emit('cancel', tab)"
        />
        <div v-if="tab.state.loading" class="absolute inset-0 z-10 grid place-items-center rounded-md bg-default/65">
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

    <div
      role="separator"
      tabindex="0"
      aria-label="Resize SQL editor and query results"
      aria-orientation="horizontal"
      :aria-valuenow="Math.round(editorHeightRatio)"
      :aria-valuemin="QUERY_PANEL_MIN_RATIO"
      :aria-valuemax="100 - QUERY_PANEL_MIN_RATIO"
      class="group relative z-20 cursor-row-resize touch-none bg-default/60 outline-none hover:bg-primary/40 focus-visible:bg-primary/60"
      :class="resizingQueryPanel ? 'bg-primary/60' : ''"
      @pointerdown="beginQueryPanelResize"
      @pointermove="resizeQueryPanel"
      @pointerup="endQueryPanelResize"
      @pointercancel="endQueryPanelResize"
      @keydown="resizeQueryPanelWithKeyboard"
    >
      <div class="absolute -inset-y-1.5 inset-x-0" />
    </div>

    <div class="flex min-h-0 flex-col">
      <QueryResultTabs
        class="min-h-0 flex-1"
        :result-tabs="tab.resultTabs"
        :active-result-tab-id="tab.activeResultTabId"
        closable
        data-view-actions
        data-view-editing
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
