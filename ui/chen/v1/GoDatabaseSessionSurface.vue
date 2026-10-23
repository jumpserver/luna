<script setup lang="ts">
import type { GoCatalogObject, GoConsole, GoEvent, GoExecution, GoSession } from "./api";
import type { ChenWorkspaceTab, QueryContext, QueryWorkspaceTab } from "./workspace";
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import { useElementSize, useLocalStorage } from "@vueuse/core";
import { chenSampleSql, chenSqlDialect } from "~/chen/utils/sqlDialect";
import { registerWorkspaceSessionCloseGuard } from "~/composables/useWorkspaceTabs";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { ChenGoError, createChenGoApi, executionActive, executionCanCancel } from "./api";
import { readChenEvents } from "./events";
import GoCatalogTree from "./GoCatalogTree.vue";
import GoObjectPane from "./GoObjectPane.vue";
import GoQueryPane from "./GoQueryPane.vue";
import { newChenRequestId } from "./requestId";
import { usePaneResize } from "./usePaneResize";
import {
  acceptQueryExecution,
  closeWarnings,
  createQueryTab,
  objectKey,
  objectSelect,
  queryDirty,
  tabContext
} from "./workspace";

const props = defineProps<{ tab?: WorkspaceSessionTab; selector?: string }>();
const { t } = useI18n();
const workspace = props.tab ? useWorkspaceTabs() : null;
const userInfo = props.tab ? useUserInfoStore() : null;
const single = props.selector !== undefined;
const endpoint =
  String(props.tab?.payload?.endpointUrl || "").trim() ||
  (props.tab?.payload?.webUrl ? new URL(String(props.tab.payload.webUrl), window.location.origin).origin : "") ||
  (isDesktopRuntime() ? userInfo?.currentSite : "") ||
  window.location.origin;
const api = createChenGoApi(endpoint, fetch, { mode: single ? "single" : "managed" });
const session = ref<GoSession | null>(null);
const tabs = ref<ChenWorkspaceTab[]>([]);
const activeId = ref("");
const defaultContext = ref<QueryContext>({ database: "", schema: "" });
const error = ref("");
const busy = ref(true);
const authenticationUnknown = ref(false);
const eventConnected = ref(false);
const drawer = ref(false);
const workspaceBody = ref<HTMLElement | null>(null);
const { width: workspaceWidth } = useElementSize(workspaceBody);
const sidebarId = useId();
// Only presentation preferences are persisted; connection details and SQL stay in memory.
const sidebarPreference = useLocalStorage("jumpserver-client:chen-v1-sidebar-width", 300, {
  writeDefaults: false,
  initOnMounted: true
});
const sidebarHidden = useLocalStorage("jumpserver-client:chen-v1-sidebar-hidden", false, {
  writeDefaults: false,
  initOnMounted: true
});
const desktopTree = computed(() => workspaceWidth.value >= 720);
const treeVisible = computed(() => desktopTree.value && !sidebarHidden.value);
const sidebarMax = computed(() => Math.max(220, Math.min(800, workspaceWidth.value - 426)));
// Keep the user's preferred width while a smaller window temporarily clamps it.
const sidebarWidth = computed({
  get: () =>
    Math.max(220, Math.min(sidebarMax.value, Number.isFinite(sidebarPreference.value) ? sidebarPreference.value : 300)),
  set: (value: number) => {
    sidebarPreference.value = value;
  }
});
const sidebarResize = usePaneResize({
  axis: "x",
  value: sidebarWidth,
  min: 220,
  max: sidebarMax,
  defaultValue: 300,
  step: 16,
  pixelsPerUnit: () => 1,
  enabled: treeVisible
});
const eventController = new AbortController();
interface QueryPaneHandle {
  focus: () => void;
  run: () => void;
  insertText: (text: string) => void;
}
const queryPanes = new Map<string, QueryPaneHandle>();
const tabStrip = ref<HTMLElement>();
const queries = computed(() => tabs.value.filter((tab): tab is QueryWorkspaceTab => tab.kind !== "object"));
const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value));
const sessionReady = computed(() => session.value?.state === "ready");
const insertTarget = computed(() => (activeTab.value?.kind === "query" ? activeTab.value : undefined));
let disposed = false;
let sequence = 0;
let queryNumber = 0;
const failureText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
function markDisconnected(reason: string) {
  if (props.tab) workspace?.markSessionDisconnected(props.tab.id, reason);
}
function setQueryPane(id: string, value: unknown) {
  if (value) queryPanes.set(id, value as QueryPaneHandle);
  else queryPanes.delete(id);
}
function selectTab(tab: ChenWorkspaceTab) {
  activeId.value = tab.id;
}
function insertName(text: string) {
  if (!session.value?.permissions.can_paste || !insertTarget.value) return;
  queryPanes.get(insertTarget.value.id)?.insertText(text);
  drawer.value = false;
}
function toggleTree() {
  if (desktopTree.value) sidebarHidden.value = !sidebarHidden.value;
  else drawer.value = !drawer.value;
}
async function tabKeydown(event: KeyboardEvent, tab: ChenWorkspaceTab) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectTab(tab);
    return;
  }
  const index = tabs.value.indexOf(tab);
  let target: ChenWorkspaceTab | undefined;
  if (event.key === "ArrowRight") target = tabs.value[(index + 1) % tabs.value.length];
  if (event.key === "ArrowLeft") target = tabs.value[(index + tabs.value.length - 1) % tabs.value.length];
  if (event.key === "Home") target = tabs.value[0];
  if (event.key === "End") target = tabs.value.at(-1);
  if (!target) return;
  event.preventDefault();
  selectTab(target);
  await nextTick();
  tabStrip.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
}
const renameTarget = ref<ChenWorkspaceTab | null>(null);
const renameTitle = ref("");
function renameTab(tab: ChenWorkspaceTab) {
  renameTitle.value = tab.title;
  renameTarget.value = tab;
}
function finishRename() {
  const title = renameTitle.value.trim();
  if (!title || !renameTarget.value) return;
  renameTarget.value.title = title.slice(0, 80);
  renameTarget.value = null;
}
function tabMenu(tab: ChenWorkspaceTab) {
  const index = tabs.value.indexOf(tab);
  const others = tabs.value.filter((item) => item.id !== tab.id);
  const right = tabs.value.slice(index + 1);
  const cannotClose = (list: ChenWorkspaceTab[]) =>
    !list.length || list.some((item) => item.kind !== "object" && item.busy);
  return [
    { label: t("Chen.GoV1RenameTab"), icon: "i-lucide-pencil", onSelect: () => renameTab(tab) },
    ...(tab.kind !== "object"
      ? [
          {
            label: t("Chen.GoV1DuplicateQuery"),
            icon: "i-lucide-copy-plus",
            disabled: !sessionReady.value || !session.value?.permissions.can_paste,
            onSelect: () => restoreQuery(tab.context, tab.sql)
          }
        ]
      : []),
    {
      label: t("Chen.GoV1CloseTab"),
      icon: "i-lucide-x",
      disabled: tab.kind !== "object" && tab.busy,
      onSelect: () => closeTab(tab)
    },
    {
      label: t("Chen.GoV1CloseOtherTabs"),
      icon: "i-lucide-panel-top-close",
      disabled: cannotClose(others),
      onSelect: () => closeTabs(others)
    },
    {
      label: t("Chen.GoV1CloseTabsRight"),
      icon: "i-lucide-arrow-right-to-line",
      disabled: cannotClose(right),
      onSelect: () => closeTabs(right)
    }
  ];
}
function isCurrent(query: QueryWorkspaceTab) {
  return !disposed && !query.closed;
}

async function loadRows(
  query: QueryWorkspaceTab,
  id: string,
  offset = 0,
  execution = query.resultExecution || query.execution,
  sql = execution?.id === query.execution?.id ? query.executionSql : query.resultSql
) {
  if (!execution) return;
  const generation = ++query.loadGeneration;
  query.loadingRows = true;
  query.resultLoadError = null;
  try {
    const page = await api.rows(id, offset);
    if (isCurrent(query) && generation === query.loadGeneration) {
      query.rows = page;
      query.resultId = id;
      // Row loading may finish after more statements or audit updates arrive.
      // Retain the latest snapshot for this execution without changing its SQL source.
      query.resultExecution = {
        ...(query.execution?.id === execution.id
          ? query.execution
          : query.resultExecution?.id === execution.id
            ? query.resultExecution
            : execution)
      };
      query.resultSql = sql;
    }
  } catch (cause) {
    if (isCurrent(query) && generation === query.loadGeneration)
      query.resultLoadError = { message: failureText(cause), id, offset, execution, sql };
  } finally {
    if (generation === query.loadGeneration) query.loadingRows = false;
  }
}
function retryRows(query: QueryWorkspaceTab) {
  const failed = query.resultLoadError;
  if (failed) void loadRows(query, failed.id, failed.offset, failed.execution, failed.sql);
}
function acceptExecution(query: QueryWorkspaceTab, value: GoExecution) {
  if (!isCurrent(query) || !acceptQueryExecution(query, value)) return;
  if (value.result_ids?.length && query.resultExecution?.id !== value.id && !query.loadingRows)
    void loadRows(query, value.result_ids[0]!, 0, query.execution, query.executionSql);
}
function loseConsole(query: QueryWorkspaceTab) {
  if (query.console) query.console.state = "lost";
  if (query.execution && executionActive(query.execution)) query.execution = { ...query.execution, status: "unknown" };
  query.error = t("Chen.GoV1ConnectionLost");
}
function acceptEvent(event: GoEvent) {
  if (event.sequence <= sequence && event.type !== "reset") return;
  sequence = event.sequence;
  if (event.type === "execution.updated") {
    const value = event.data as GoExecution;
    const query = queries.value.find((query) => query.console?.id === value.console_id);
    if (query) acceptExecution(query, value);
  }
  if (event.type === "session.updated") session.value = event.data as GoSession;
  if (event.type === "console.updated") {
    const value = event.data as GoConsole;
    const query = queries.value.find((query) => query.console?.id === value.id);
    if (query) {
      query.console = value;
      if (value.state === "lost") loseConsole(query);
    }
  }
  if (event.type === "session.closed") {
    if (session.value) session.value.state = "closed";
    eventController.abort();
    error.value = String((event.data as { reason?: string }).reason || t("Chen.GoV1SessionClosed"));
    for (const query of queries.value) if (executionActive(query.execution)) loseConsole(query);
    markDisconnected(error.value);
  }
  if (event.type === "reset") {
    const snapshot = event.data as { session: GoSession; consoles: GoConsole[]; executions: GoExecution[] };
    session.value = snapshot.session;
    for (const query of queries.value) {
      if (!query.console) continue;
      const current = (snapshot.consoles || []).find((item) => item.id === query.console!.id);
      if (current) query.console = current;
      if (!current || current.state === "lost") loseConsole(query);
      const execution = (snapshot.executions || []).find((item) => item.id === query.execution?.id);
      if (execution) acceptExecution(query, execution);
    }
    if (snapshot.session.state === "closed") {
      eventController.abort();
      markDisconnected(t("Chen.GoV1SessionClosed"));
    }
  }
}
async function syncExecution(query: QueryWorkspaceTab) {
  if (!query.execution || query.execution.console_id !== query.console?.id) return;
  acceptExecution(query, await api.execution(query.execution.id));
}
async function watchEvents() {
  let delay = 1000;
  while (true) {
    if (eventController.signal.aborted || disposed || !session.value) break;
    try {
      const stream = await api.events(session.value.id, sequence, eventController.signal);
      eventConnected.value = true;
      await Promise.allSettled(queries.value.map(syncExecution));
      delay = 1000;
      await readChenEvents(stream, acceptEvent, eventController.signal);
    } catch (cause) {
      if (eventController.signal.aborted) break;
      if (cause instanceof ChenGoError && [401, 403, 404, 410].includes(cause.status)) {
        error.value = failureText(cause);
        if (session.value) session.value.state = "closed";
        for (const query of queries.value) if (executionActive(query.execution)) loseConsole(query);
        markDisconnected(error.value);
        break;
      }
    } finally {
      eventConnected.value = false;
    }
    if (eventController.signal.aborted) break;
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const done = () => {
        clearTimeout(timer);
        eventController.signal.removeEventListener("abort", done);
        resolve();
      };
      timer = setTimeout(done, delay);
      eventController.signal.addEventListener("abort", done, { once: true });
    });
    delay = Math.min(delay * 2, 10_000);
  }
}
async function connectQuery(query: QueryWorkspaceTab) {
  if (!sessionReady.value || !session.value || query.busy) return;
  query.busy = true;
  query.error = "";
  try {
    const console = await api.openConsole(session.value.id, {
      database: query.context.database || undefined,
      schema: query.context.schema || undefined
    });
    if (!isCurrent(query)) {
      await api.closeConsole(console.id);
      return;
    }
    query.console = console;
    query.context = { database: console.database, schema: console.schema };
    if (!defaultContext.value.database) defaultContext.value = { ...query.context };
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function newQuery(
  context = tabContext(activeTab.value, defaultContext.value),
  object?: GoCatalogObject,
  preview = false
) {
  if (!sessionReady.value) return;
  if (object && !preview && !session.value?.permissions.can_paste) return;
  const sql = object ? objectSelect(object, session.value!.dialect, preview) : chenSampleSql(session.value!.dialect);
  const query = reactive(
    createQueryTab(
      `${t(preview ? "Chen.GoV1Preview" : "Chen.Query")} ${++queryNumber}`,
      context,
      sql,
      !!object && !preview
    )
  );
  if (preview) query.kind = "preview";
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  await connectQuery(query);
  if (preview && query.console) await submit(query, sql, 1);
}
async function restoreQuery(context: QueryContext, sql: string) {
  if (!sessionReady.value || !session.value?.permissions.can_paste) return;
  const query = reactive(createQueryTab(`${t("Chen.Query")} ${++queryNumber}`, context, sql, true));
  tabs.value.push(query);
  activeId.value = query.id;
  drawer.value = false;
  await connectQuery(query);
}
function openObject(object: GoCatalogObject) {
  const id = `object:${objectKey(object)}`;
  if (!tabs.value.some((tab) => tab.id === id)) tabs.value.push({ id, kind: "object", title: object.name, object });
  activeId.value = id;
  drawer.value = false;
}
async function submit(query: QueryWorkspaceTab, sql: string, version: number) {
  if (
    !isCurrent(query) ||
    !sessionReady.value ||
    query.console?.state !== "ready" ||
    executionActive(query.execution) ||
    query.busy ||
    query.pending ||
    !sql.trim()
  )
    return;
  query.loadGeneration++;
  query.loadingRows = false;
  query.resultLoadError = null;
  query.pending = { sql, version, id: newChenRequestId() };
  await recoverSubmission(query);
}
async function recoverSubmission(query: QueryWorkspaceTab) {
  const pending = query.pending;
  if (!pending || !sessionReady.value || query.console?.state !== "ready" || query.busy) return;
  query.busy = true;
  query.error = "";
  try {
    const value = await api.execute(query.console.id, pending.sql, pending.version, pending.id);
    if (!isCurrent(query)) return;
    query.pending = null;
    query.execution = value;
    query.executionSql = pending.sql;
    acceptExecution(query, value);
    await syncExecution(query);
  } catch (cause) {
    if (!isCurrent(query)) return;
    if (cause instanceof ChenGoError && cause.status >= 400 && cause.status < 500) query.pending = null;
    query.error = query.pending ? `${t("Chen.GoV1SubmissionUnknown")} ${failureText(cause)}` : failureText(cause);
  } finally {
    if (isCurrent(query)) query.busy = false;
  }
}
async function cancel(query: QueryWorkspaceTab) {
  if (!query.execution || !executionCanCancel(query.execution, session.value?.can_cancel)) return;
  try {
    acceptExecution(query, await api.cancel(query.execution.id));
  } catch (cause) {
    if (isCurrent(query)) query.error = failureText(cause);
  }
}

const closeDialog = ref<ReturnType<typeof closeWarnings> | null>(null);
let closeResolver: ((value: boolean) => void) | undefined;
function confirmClose(list: QueryWorkspaceTab[]) {
  if (session.value?.can_cancel === false) {
    const running = list.filter((query) => executionActive(query.execution));
    if (running.length) {
      for (const query of running) query.error = t("Chen.GoV1CloseCancelUnsupported");
      return Promise.resolve(false);
    }
  }
  const warnings = closeWarnings(list);
  if (!Object.values(warnings).some(Boolean)) return Promise.resolve(true);
  if (closeResolver) return Promise.resolve(false);
  closeDialog.value = warnings;
  return new Promise<boolean>((resolve) => {
    closeResolver = resolve;
  });
}
function finishClose(value: boolean) {
  closeDialog.value = null;
  closeResolver?.(value);
  closeResolver = undefined;
}
async function closeTabs(list: ChenWorkspaceTab[]) {
  const queries = list.filter((tab): tab is QueryWorkspaceTab => tab.kind !== "object");
  if (queries.some((query) => query.busy) || !(await confirmClose(queries))) return;
  for (const tab of list) await closeTab(tab, true);
}
async function closeTab(tab: ChenWorkspaceTab, confirmed = false) {
  if (tab.kind !== "object") {
    if (tab.busy || (!confirmed && !(await confirmClose([tab]))) || !isCurrent(tab)) return;
    if (session.value?.can_cancel === false && executionActive(tab.execution)) {
      tab.error = t("Chen.GoV1CloseCancelUnsupported");
      return;
    }
    tab.busy = true;
    try {
      if (tab.execution && executionActive(tab.execution)) await api.cancel(tab.execution.id);
      if (tab.console) await api.closeConsole(tab.console.id);
    } catch (cause) {
      tab.error = failureText(cause);
      tab.busy = false;
      return;
    }
    tab.closed = true;
    tab.loadGeneration++;
  }
  const index = tabs.value.findIndex((item) => item.id === tab.id);
  if (index < 0) return;
  tabs.value.splice(index, 1);
  if (activeId.value === tab.id) activeId.value = tabs.value[Math.max(0, index - 1)]?.id || "";
}
async function reconnect(query: QueryWorkspaceTab) {
  if (!sessionReady.value || query.busy || !(await confirmClose([query]))) return;
  try {
    if (query.console) await api.closeConsole(query.console.id);
  } catch (cause) {
    if (!(cause instanceof ChenGoError && [404, 410].includes(cause.status))) {
      query.error = failureText(cause);
      return;
    }
  }
  if (query.execution && executionActive(query.execution)) query.execution = { ...query.execution, status: "unknown" };
  query.pending = null;
  await connectQuery(query);
}
async function startSession() {
  busy.value = true;
  error.value = "";
  authenticationUnknown.value = false;
  try {
    if (single) session.value = await api.authenticateSelector(props.selector!);
    else {
      const token = props.tab?.payload?.token as { id?: string } | undefined;
      const connectToken = String(token?.id || props.tab?.payload?.id || "");
      if (!connectToken) throw new ChenGoError("missing_token", t("Chen.GoV1MissingToken"), 400);
      session.value = await api.authenticate(connectToken);
    }
    if (disposed) {
      await api.closeSession(session.value.id);
      return;
    }
    await newQuery();
    if (props.tab) workspace?.markSessionConnected(props.tab.id);
    void watchEvents();
  } catch (cause) {
    if (!disposed) {
      authenticationUnknown.value = !session.value && (!(cause instanceof ChenGoError) || cause.status >= 500);
      error.value = failureText(cause);
      markDisconnected(error.value);
    }
  } finally {
    if (!disposed) busy.value = false;
  }
}
async function closeSession() {
  if (!session.value || busy.value || !(await confirmClose(queries.value))) return;
  busy.value = true;
  try {
    await api.closeSession(session.value.id);
    session.value.state = "closed";
    eventController.abort();
    for (const query of queries.value) {
      if (query.console) query.console.state = "closed";
      if (query.execution && executionActive(query.execution))
        query.execution = { ...query.execution, status: "unknown" };
    }
    markDisconnected(t("Chen.GoV1SessionClosed"));
  } catch (cause) {
    error.value = failureText(cause);
  } finally {
    busy.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (Object.values(closeWarnings(queries.value)).some(Boolean)) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function preventCopy(event: ClipboardEvent) {
  if (session.value && !session.value.permissions.can_copy) event.preventDefault();
}
const unregisterCloseGuard = props.tab
  ? registerWorkspaceSessionCloseGuard(props.tab.id, () => confirmClose(queries.value))
  : undefined;
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  void startSession();
});
onBeforeUnmount(() => {
  disposed = true;
  finishClose(false);
  unregisterCloseGuard?.();
  window.removeEventListener("beforeunload", beforeUnload);
  eventController.abort();
  for (const query of queries.value) {
    query.closed = true;
    query.loadGeneration++;
  }
  if (session.value && session.value.state !== "closed") void api.closeSession(session.value.id).catch(() => {});
});
defineExpose({ focus: () => queryPanes.get(activeId.value)?.focus() });
</script>

<template>
  <section
    class="flex h-full min-h-0 flex-col bg-[var(--workspace-surface-main)] text-[var(--app-fg)]"
    @copy.capture="preventCopy"
    @cut.capture="preventCopy"
  >
    <div
      class="flex min-h-[var(--workspace-toolbar-height)] shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-1.5"
    >
      <UButton
        :icon="treeVisible ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
        :label="t('Chen.GoV1Objects')"
        :aria-expanded="desktopTree ? treeVisible : drawer"
        :aria-controls="sidebarId"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="toggleTree"
      />
      <UIcon name="i-lucide-database" class="size-4 shrink-0" />
      <span class="max-w-80 truncate text-xs" :title="session?.asset || tab?.assetName || selector">
        {{ session?.asset || tab?.assetName || selector }}
      </span>
      <UBadge color="neutral" variant="soft" size="xs">
        {{ chenSqlDialect(session?.dialect || tab?.protocol || "").label }}
      </UBadge>
      <span
        v-if="sessionReady"
        class="flex items-center gap-1.5 text-xs"
        :class="eventConnected ? 'text-muted' : 'text-warning'"
        :title="t(eventConnected ? 'Chen.GoV1EventsConnected' : 'Chen.GoV1EventsReconnecting')"
      >
        <UIcon
          :name="eventConnected ? 'i-lucide-check' : 'i-lucide-loader-circle'"
          class="size-3"
          :class="{ 'animate-spin': !eventConnected }"
        />
        {{ t(eventConnected ? "Chen.GoV1Connected" : "Chen.GoV1StatusSyncing") }}
      </span>
      <UButton
        class="ml-auto"
        icon="i-lucide-unplug"
        :label="t('Chen.GoV1Close')"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!session || session.state === 'closed' || busy"
        @click="closeSession"
      />
    </div>
    <div v-if="error" role="alert" class="shrink-0 border-b border-error/25 bg-error/10 px-3 py-2 text-xs text-error">
      {{ error }}
    </div>
    <div
      v-if="session && session.state !== 'ready'"
      role="status"
      class="shrink-0 border-b border-default px-3 py-2 text-xs text-warning"
    >
      {{ t("Chen.GoV1SessionUnavailable") }} ({{ session.state }})
    </div>
    <div v-if="!session" class="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
      <UIcon v-if="busy" name="i-lucide-loader-circle" class="size-4 animate-spin" />
      {{ busy ? t("Chen.GoV1Connecting") : t("Chen.GoV1ConnectionFailed") }}
      <UButton
        v-if="authenticationUnknown && !busy"
        :label="t('Chen.GoV1RecoverAuthentication')"
        :title="t('Chen.GoV1RecoverAuthenticationHint')"
        color="warning"
        variant="soft"
        size="xs"
        @click="startSession"
      />
    </div>
    <div v-else ref="workspaceBody" class="relative flex min-h-0 flex-1">
      <button
        v-if="drawer && !desktopTree"
        class="absolute inset-0 z-10 bg-[var(--workspace-surface-main)] opacity-60"
        :aria-label="t('Chen.GoV1CloseObjects')"
        @click="drawer = false"
      />
      <aside
        :id="sidebarId"
        class="shrink-0 flex-col bg-[var(--workspace-surface-sidebar)]"
        :class="
          desktopTree
            ? treeVisible
              ? 'relative flex'
              : 'hidden'
            : drawer
              ? 'absolute inset-y-0 left-0 z-20 flex max-w-[90%] border-r border-default shadow-xl'
              : 'hidden'
        "
        :style="{ width: `${desktopTree ? sidebarWidth : 360}px` }"
      >
        <GoCatalogTree
          v-if="defaultContext.database"
          :api="api"
          :session-id="session.id"
          :dialect="session.dialect"
          :database="defaultContext.database"
          :asset="session.asset || selector || ''"
          :ready="sessionReady"
          :can-paste="session.permissions.can_paste"
          :can-copy="session.permissions.can_copy"
          :can-insert="!!insertTarget"
          @insert="insertName"
          @object="openObject"
          @query="(context, object) => newQuery(context, object)"
          @preview="(object) => newQuery({ database: object.database, schema: object.schema }, object, true)"
        />
        <div v-else class="p-3 text-xs text-muted">{{ t("Chen.GoV1Connecting") }}</div>
      </aside>
      <div
        v-if="treeVisible"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('Chen.ResizeDatabaseSidebar')"
        :aria-controls="sidebarId"
        :aria-valuenow="Math.round(sidebarWidth)"
        :aria-valuemin="220"
        :aria-valuemax="Math.round(sidebarMax)"
        :aria-valuetext="`${Math.round(sidebarWidth)} px`"
        :title="`${t('Chen.ResizeDatabaseSidebar')} · ${t('Chen.GoV1ResizeHint')}`"
        class="group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none bg-[var(--workspace-surface-sidebar)] outline-none hover:bg-primary/15 focus-visible:bg-primary/20"
        :class="{ 'bg-primary/20': sidebarResize.dragging.value }"
        @pointerdown="sidebarResize.begin"
        @pointermove="sidebarResize.move"
        @pointerup="sidebarResize.end"
        @pointercancel="sidebarResize.end"
        @lostpointercapture="sidebarResize.end"
        @keydown="sidebarResize.keydown"
        @dblclick="sidebarResize.reset"
      >
        <span
          class="pointer-events-none absolute inset-y-0 left-1/2 border-l border-default group-hover:border-primary group-focus-visible:border-primary"
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref="tabStrip"
          role="tablist"
          :aria-label="t('Chen.GoV1WorkspaceTabs')"
          class="flex min-h-10 shrink-0 overflow-x-auto border-b border-default"
        >
          <div class="flex max-w-full items-stretch" :style="{ width: `${tabs.length * 176 + 40}px` }">
            <UContextMenu v-for="item in tabs" :key="item.id" :items="tabMenu(item)">
              <div
                role="tab"
                :aria-selected="activeId === item.id"
                :tabindex="activeId === item.id ? 0 : -1"
                class="flex w-44 min-w-28 shrink items-center gap-1.5 border-r border-default px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                :class="
                  activeId === item.id
                    ? 'border-b-2 border-b-primary bg-[var(--workspace-surface-main)]'
                    : 'bg-[var(--workspace-surface-sidebar)] text-muted'
                "
                :title="
                  item.kind === 'object'
                    ? `${item.object.database}.${item.object.schema}.${item.object.name}`
                    : `${item.context.database} / ${item.context.schema}`
                "
                @click="selectTab(item)"
                @dblclick="renameTab(item)"
                @keydown="tabKeydown($event, item)"
              >
                <UIcon
                  :name="
                    item.kind === 'object'
                      ? 'i-lucide-table-properties'
                      : executionActive(item.execution)
                        ? 'i-lucide-loader-circle'
                        : 'i-lucide-file-code-2'
                  "
                  class="size-3.5 shrink-0"
                  :class="{ 'animate-spin': item.kind !== 'object' && executionActive(item.execution) }"
                />
                <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
                <span
                  v-if="item.kind !== 'object' && queryDirty(item)"
                  :title="t('Chen.GoV1MemoryDraft')"
                  class="text-warning"
                >
                  ●
                </span>
                <UButton
                  icon="i-lucide-x"
                  :aria-label="`${t('Chen.GoV1CloseTab')} ${item.title}`"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="item.kind !== 'object' && item.busy"
                  @click.stop="closeTab(item)"
                  @dblclick.stop
                />
              </div>
            </UContextMenu>
            <UButton
              icon="i-lucide-plus"
              :aria-label="t('Chen.NewQuery')"
              :title="t('Chen.GoV1NewQueryHint')"
              class="m-1 shrink-0"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="!sessionReady"
              @click="newQuery()"
            />
          </div>
        </div>
        <div v-if="!tabs.length" class="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted">
          <p>{{ t("Chen.GoV1EmptyWorkspace") }}</p>
          <UButton :label="t('Chen.NewQuery')" size="sm" :disabled="!sessionReady" @click="newQuery()" />
        </div>
        <div v-for="item in tabs" v-show="activeId === item.id" :key="item.id" class="flex min-h-0 flex-1 flex-col">
          <GoObjectPane
            v-if="item.kind === 'object'"
            :object="item.object"
            :api="api"
            :session-id="session.id"
            :ready="sessionReady"
            :can-copy="session.permissions.can_copy"
            :can-paste="session.permissions.can_paste"
            @query="newQuery({ database: item.object.database, schema: item.object.schema }, item.object)"
            @preview="newQuery({ database: item.object.database, schema: item.object.schema }, item.object, true)"
          />
          <GoQueryPane
            v-else
            :ref="(value) => setQueryPane(item.id, value)"
            :query="item"
            :session="session"
            :api="api"
            :single="single"
            :visible="activeId === item.id"
            @sql="item.sql = $event"
            @restore="(sql: string) => restoreQuery(item.context, sql)"
            @run="(sql, version) => submit(item, sql, version)"
            @cancel="cancel(item)"
            @recover="recoverSubmission(item)"
            @reconnect="reconnect(item)"
            @rows="(id, offset) => loadRows(item, id, offset)"
            @retry-rows="retryRows(item)"
          />
        </div>
        <div
          class="flex shrink-0 flex-wrap items-center gap-x-3 border-t border-default px-3 py-1 text-[11px] text-muted"
        >
          <span :title="t('Chen.GoV1MemoryDraft')">{{ t("Chen.GoV1MemoryDraftShort") }}</span>
          <span class="ml-auto" :title="t('Chen.GoV1Shortcuts')">Ctrl/⌘ Enter · {{ t("Chen.GoV1RunCurrent") }}</span>
        </div>
      </div>
    </div>
    <UModal
      :open="!!renameTarget"
      :title="t('Chen.GoV1RenameTab')"
      :description="t('Chen.GoV1RenameTabHint')"
      @update:open="
        (value) => {
          if (!value) renameTarget = null;
        }
      "
    >
      <template #body>
        <form @submit.prevent="finishRename">
          <UInput v-model="renameTitle" autofocus maxlength="80" class="w-full" :aria-label="t('Chen.GoV1TabName')" />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Chen.GoV1KeepEditing')" color="neutral" variant="soft" @click="renameTarget = null" />
          <UButton :label="t('Chen.GoV1RenameTab')" :disabled="!renameTitle.trim()" @click="finishRename" />
        </div>
      </template>
    </UModal>
    <UModal
      :open="!!closeDialog"
      :title="t('Chen.GoV1ConfirmClose')"
      :description="t('Chen.GoV1CloseDescription')"
      @update:open="
        (value) => {
          if (!value) finishClose(false);
        }
      "
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p v-if="closeDialog?.dirty" class="text-warning">{{ t("Chen.GoV1CloseDirty") }}</p>
          <p v-if="closeDialog?.running" class="text-warning">{{ t("Chen.GoV1CloseRunning") }}</p>
          <p v-if="closeDialog?.unknown" class="text-error">{{ t("Chen.GoV1CloseUnknown") }}</p>
          <p v-if="closeDialog?.transaction">{{ t("Chen.GoV1CloseTransaction") }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton :label="t('Chen.GoV1KeepEditing')" color="neutral" variant="soft" @click="finishClose(false)" />
          <UButton :label="t('Chen.GoV1ConfirmDiscardClose')" color="warning" @click="finishClose(true)" />
        </div>
      </template>
    </UModal>
  </section>
</template>
