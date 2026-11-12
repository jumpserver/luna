import type { ColumnState } from "ag-grid-community";
import type { OverviewViewSection } from "./overview";
import type {
  ChenGoApi,
  GoBrowseDraft,
  GoBrowseRequest,
  GoQueryPageRequest,
  GoPlan,
  GoCatalogObject,
  GoConsole,
  GoTransactionRequest,
  GoExecution,
  GoExport,
  GoExportFormat,
  GoRows
} from "./api";
import type { GoEditDraft } from "./dataEditing";
import { useStorage } from "@vueuse/core";
import { chenSqlDialect } from "~/chen/utils/sqlDialect";
import { executionActive, reconcileExecution } from "./api";
import { createEditDraft, editDirty } from "./dataEditing";
import { newChenRequestId } from "./requestId";

// Share the established workspace display preferences with both SQL and object pages.
export { useChenWorkspacePreferences } from "~/chen/composables/useChenWorkspacePreferences";

export interface QueryContext {
  database: string;
  schema: string;
}
export interface QueryPlanRun {
  number: number;
  sql: string;
  executionId: string;
  planRequestId: string;
  state: "pending" | "loading" | "loaded" | "failed" | "interrupted";
  plan: GoPlan | null;
  error: string;
}
export interface QueryWorkspaceTab {
  id: string;
  kind: "query" | "preview" | "console";
  title: string;
  sql: string;
  baselineSql: string;
  context: QueryContext;
  console: GoConsole | null;
  execution: GoExecution | null;
  executionSql: string;
  executionVersion: number;
  executionPlanNumber?: number;
  resultPane: "results" | number;
  planSequence: number;
  planRuns: QueryPlanRun[];
  pinnedResults: QueryWorkspaceTab[];
  pinnedResultId: string | null;
  executionTransaction?: GoTransactionRequest;
  executionConfirmWarnings: boolean;
  executionSubmitReview: boolean;
  executionExportFormat?: GoExportFormat;
  browseObject?: GoCatalogObject;
  readOnly?: boolean;
  loadingSettings: GoResultLoadingSettings;
  pendingLoading: GoResultLoadingSettings | null;
  loadMoreFailed: boolean;
  browseDraft: GoBrowseDraft;
  browseCount: { source_result_id: string; total: string } | null;
  edit: GoEditDraft;
  executionEditPlan?: string;
  executionRefresh?: {
    viewId: string;
    offset: number;
    status: GoEditDraft["status"];
    saveError?: GoExecution["error"];
    retryOffset?: number;
  };
  resultViewId?: string;
  resultTransactionRevision?: number;
  gridView?: { filter: string; columns: ColumnState[] };
  executionBrowse?: GoBrowseRequest;
  executionQueryPage?: GoQueryPageRequest;
  queryCount?: GoExecution["query_count"] | null;
  exportJob: GoExport | null;
  exportBusy: boolean;
  pendingCachedExport: { resultId: string; format: GoExportFormat; id: string; rows?: number } | null;
  resultExecution: GoExecution | null;
  resultTabs: { id: string; execution: GoExecution; sql: string }[];
  replacedResultIds: string[];
  loadedExecutionId?: string;
  pinnedSource?: boolean;
  resultSql: string;
  rows: GoRows | null;
  resultId: string;
  cachedResult?: {
    id: string;
    offset: number;
    execution: GoExecution;
    sql: string;
    loadingSettings: GoResultLoadingSettings;
  };
  pending: {
    transaction?: GoTransactionRequest;
    sql: string;
    version: number;
    id: string;
    submitReview?: boolean;
    confirmWarnings?: boolean;
    planNumber?: number;
    exportFormat?: GoExportFormat;
    editPlanId?: string;
    browse?: GoBrowseRequest;
    queryPage?: GoQueryPageRequest;
    refresh?: boolean;
  } | null;
  busy: boolean;
  loadingRows: boolean;
  resultLoadError: {
    append?: boolean;
    message: string;
    id: string;
    offset: number;
    execution: GoExecution;
    sql: string;
  } | null;
  loadGeneration: number;
  error: string;
  closed: boolean;
}
export type ObjectWorkspaceSection =
  | "data"
  | "structure"
  | "basic"
  | "columns"
  | "indexes"
  | "foreign_keys"
  | "constraints"
  | "primary_key"
  | "defaults"
  | "ddl"
  | "diagram";
export interface ObjectWorkspaceTab {
  id: string;
  kind: "object";
  title: string;
  object: GoCatalogObject;
  sessionId: string;
  section: ObjectWorkspaceSection;
  data: QueryWorkspaceTab | null;
}
export interface OverviewWorkspaceTab {
  id: string;
  kind: "overview";
  section?: OverviewViewSection;
  title: string;
  context: QueryContext;
}
export type ChenWorkspaceTab = QueryWorkspaceTab | ObjectWorkspaceTab | OverviewWorkspaceTab;
export function isQueryWorkspaceTab(tab: ChenWorkspaceTab): tab is QueryWorkspaceTab {
  return tab.kind === "query" || tab.kind === "preview" || tab.kind === "console";
}

// An object owns at most one execution context, visible to every query lifecycle consumer.
export function workspaceQuery(tab: ChenWorkspaceTab): QueryWorkspaceTab | null {
  return tab.kind === "object" ? tab.data : isQueryWorkspaceTab(tab) ? tab : null;
}
export function workspaceQueries(tabs: ChenWorkspaceTab[]): QueryWorkspaceTab[] {
  return tabs.flatMap((tab) => {
    const query = workspaceQuery(tab);
    return query ? [query, ...query.pinnedResults] : [];
  });
}
export function objectWorkspaceKey(sessionId: string, object: GoCatalogObject) {
  // Catalog names are the server's canonical identifiers. Preserve quoted case and dots;
  // client-side folding would conflate distinct objects on case-sensitive databases.
  return JSON.stringify([sessionId, object.database, object.schema, object.kind, object.name]);
}
export function createQueryTab(
  title: string,
  context: QueryContext,
  sql = "SELECT 1;",
  generated = false
): QueryWorkspaceTab {
  return {
    id: newChenRequestId(),
    kind: "query",
    title,
    sql,
    baselineSql: generated ? "" : sql,
    context: { ...context },
    console: null,
    execution: null,
    executionSql: "",
    executionVersion: 0,
    resultPane: "results",
    planSequence: 0,
    planRuns: [],
    pinnedResults: [],
    pinnedResultId: null,
    executionConfirmWarnings: false,
    executionSubmitReview: false,
    edit: createEditDraft(),
    loadingSettings: { mode: "page", batchSize: 50 },
    pendingLoading: null,
    loadMoreFailed: false,
    browseDraft: { where: "", sort: [], page_size: 50 },
    browseCount: null,
    exportJob: null,
    exportBusy: false,
    pendingCachedExport: null,
    resultExecution: null,
    resultTabs: [],
    replacedResultIds: [],
    resultSql: "",
    rows: null,
    resultId: "",
    pending: null,
    busy: false,
    loadingRows: false,
    resultLoadError: null,
    loadGeneration: 0,
    error: "",
    closed: false
  };
}
export function objectKey(object: GoCatalogObject) {
  return JSON.stringify([object.database, object.schema, object.kind, object.name]);
}
export function quoteIdentifier(value: string, dialect: string) {
  const quote = chenSqlDialect(dialect).quote;
  const close = quote === "[" ? "]" : quote;
  return `${quote}${value.replaceAll(close, close + close)}${close}`;
}
export function qualifiedObjectName(object: GoCatalogObject, dialect: string) {
  const namespace = chenSqlDialect(dialect).databaseNamespace ? object.schema || object.database : object.schema;
  return [namespace, object.name]
    .filter(Boolean)
    .map((part) => quoteIdentifier(part, dialect))
    .join(".");
}
export function objectSelect(object: GoCatalogObject, dialect: string, preview = false) {
  const name = qualifiedObjectName(object, dialect);
  if (!preview) return `SELECT * FROM ${name};`;
  switch (chenSqlDialect(dialect).preview) {
    case "top":
      return `SELECT TOP (50) * FROM ${name};`;
    case "fetch":
      return `SELECT * FROM ${name} FETCH FIRST 50 ROWS ONLY;`;
    // ROWNUM also supports Oracle versions before the FETCH FIRST clause.
    case "rownum":
      return `SELECT * FROM ${name} WHERE ROWNUM <= 50;`;
    default:
      return `SELECT * FROM ${name} LIMIT 50;`;
  }
}
export function tabContext<T extends ChenWorkspaceTab | Pick<ObjectWorkspaceTab, "kind" | "object">>(
  tab: T | undefined,
  fallback: QueryContext
): QueryContext {
  if (!tab) return { ...fallback };
  if (tab.kind === "object") return { database: tab.object.database, schema: tab.object.schema };
  return { ...tab.context };
}
export function queryDirty(query: QueryWorkspaceTab): boolean {
  return query.sql !== query.baselineSql || editDirty(query.edit) || query.pinnedResults.some(queryDirty);
}
export function reviewSubmission(query: QueryWorkspaceTab): QueryWorkspaceTab["pending"] {
  if (query.executionEditPlan && query.edit.plan?.plan_id !== query.executionEditPlan) return null;
  if (query.execution?.status !== "failed" || query.execution.error?.code !== "command_review_required") return null;
  // The reviewer must receive exactly the command that required approval, even if the editor has changed.
  if (!query.executionSql.trim()) return null;
  return {
    sql: query.executionSql,
    version: query.executionVersion,
    id: newChenRequestId(),
    submitReview: true,
    ...(query.executionBrowse ? { browse: query.executionBrowse } : {}),
    ...(query.executionQueryPage ? { queryPage: query.executionQueryPage } : {}),
    ...(query.executionEditPlan ? { editPlanId: query.executionEditPlan } : {}),
    ...(query.executionExportFormat ? { exportFormat: query.executionExportFormat } : {}),
    ...(query.executionTransaction ? { transaction: query.executionTransaction } : {}),
    ...(query.executionPlanNumber ? { planNumber: query.executionPlanNumber } : {}),
    ...(query.executionConfirmWarnings ? { confirmWarnings: true } : {})
  };
}
export function warningSubmission(query: QueryWorkspaceTab): QueryWorkspaceTab["pending"] {
  if (query.executionEditPlan && query.edit.plan?.plan_id !== query.executionEditPlan) return null;
  if (query.execution?.status !== "failed" || query.execution.error?.code !== "command_warning_confirmation_required")
    return null;
  if (!query.executionSql.trim()) return null;
  return {
    sql: query.executionSql,
    version: query.executionVersion,
    id: newChenRequestId(),
    confirmWarnings: true,
    ...(query.executionBrowse ? { browse: query.executionBrowse } : {}),
    ...(query.executionQueryPage ? { queryPage: query.executionQueryPage } : {}),
    ...(query.executionEditPlan ? { editPlanId: query.executionEditPlan } : {}),
    ...(query.executionExportFormat ? { exportFormat: query.executionExportFormat } : {}),
    ...(query.executionTransaction ? { transaction: query.executionTransaction } : {}),
    ...(query.executionPlanNumber ? { planNumber: query.executionPlanNumber } : {}),
    ...(query.executionSubmitReview ? { submitReview: true } : {})
  };
}
export function closeQuerySession(query: QueryWorkspaceTab) {
  if (query.console) query.console.state = "closed";
  if (executionActive(query.execution)) query.execution = { ...query.execution!, status: "unknown" };
  query.loadGeneration++;
  query.loadingRows = false;
  interruptQueryPlans(query);
}
export function acceptQueryExecution(query: QueryWorkspaceTab, value: GoExecution) {
  if (query.closed || value.console_id !== query.console?.id) return false;
  if (
    query.rows &&
    value.transaction?.outcome &&
    value.transaction.revision > (query.resultTransactionRevision ?? -1) &&
    ["committed", "rolled_back", "implicit_commit", "unknown"].includes(value.transaction.outcome)
  ) {
    query.edit.refreshRequired = true;
    query.edit.transactionStale = true;
    if (query.edit.status === "staged") {
      query.edit.status = value.transaction.outcome === "implicit_commit" ? "committed" : value.transaction.outcome;
    }
  }
  if (query.console && value.transaction && value.transaction.revision >= (query.console.transaction?.revision || 0))
    query.console.transaction = value.transaction;
  for (const result of query.resultTabs) {
    if (result.execution.id === value.id) result.execution = reconcileExecution(result.execution, value);
  }
  if (query.resultExecution?.id === value.id) query.resultExecution = reconcileExecution(query.resultExecution, value);
  if (query.pending || (query.execution && value.id !== query.execution.id)) return false;
  query.execution = reconcileExecution(query.execution, value);
  return true;
}
export function mergeCatalogNodes<T extends { id: string; label: string; detail?: string; object?: GoCatalogObject }>(
  previous: T[],
  incoming: T[],
  append: boolean
): T[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const merged = incoming.map((item) => {
    const existing = byId.get(item.id);
    if (!existing) return item;
    existing.label = item.label;
    existing.detail = item.detail;
    existing.object = item.object;
    return existing;
  });
  return append ? [...previous, ...merged.filter((item) => !byId.has(item.id))] : merged;
}
export function closeWarnings(queries: QueryWorkspaceTab[]) {
  return {
    dirty: queries.some(queryDirty),
    running: queries.some(
      (query) =>
        executionActive(query.execution) ||
        !!query.pending ||
        query.busy ||
        query.exportBusy ||
        !!query.pendingCachedExport ||
        exportActive(query.exportJob)
    ),
    unknown: queries.some(
      (query) => !!query.pending || !!query.pendingCachedExport || query.execution?.status === "unknown"
    ),
    transaction: queries.some(
      (query) =>
        query.console &&
        query.console.state !== "closed" &&
        (!query.console.transaction?.manual || query.console.transaction.state !== "idle")
    )
  };
}
export function exportActive(job: GoExport | null) {
  return !!job && ["queued", "running", "waiting_review", "cancel_requested"].includes(job.status);
}
export function reconcileExport(current: GoExport, value: GoExport): GoExport {
  if (current.id !== value.id) return current;
  if (current.status === "expired") return current;
  if (!exportActive(current) && exportActive(value)) return current;
  const rank: Record<string, number> = { queued: 0, waiting_review: 1, running: 2, cancel_requested: 3 };
  if (exportActive(current) && exportActive(value) && rank[value.status]! < rank[current.status]!) return current;
  if (!exportActive(current) && current.status !== value.status && value.status !== "expired") return current;
  return { ...value, rows: Math.max(current.rows, value.rows), bytes: Math.max(current.bytes, value.bytes) };
}

export function openQueryPlan(query: QueryWorkspaceTab, sql: string) {
  // The prompt console keeps completed plans in its own bounded timeline.
  if (query.kind === "console") query.planRuns = query.planRuns.filter((run) => run.state === "loading");
  const number = ++query.planSequence;
  query.planRuns.push({ number, sql, executionId: "", planRequestId: "", state: "pending", plan: null, error: "" });
  query.resultPane = number;
  return number;
}

export function closeQueryPlan(query: QueryWorkspaceTab, number: number) {
  const index = query.planRuns.findIndex((run) => run.number === number);
  if (index < 0) return;
  query.planRuns.splice(index, 1);
  if (query.resultPane === number)
    query.resultPane = (query.planRuns[index] || query.planRuns[index - 1])?.number ?? "results";
}

export function interruptQueryPlans(query: QueryWorkspaceTab) {
  for (const run of query.planRuns) {
    if (run.state === "pending" || run.state === "loading") run.state = "interrupted";
  }
}

export async function loadQueryPlan(query: QueryWorkspaceTab, run: QueryPlanRun, api: Pick<ChenGoApi, "plan">) {
  const { executionId, planRequestId } = run;
  const consoleId = query.console?.id;
  if (!executionId || !planRequestId || query.closed || query.console?.state !== "ready" || run.state === "loading")
    return;
  run.state = "loading";
  run.error = "";
  // Another execution or tab selection can be active when this request finishes.
  const current = () =>
    !query.closed &&
    query.console?.id === consoleId &&
    run.state === "loading" &&
    run.executionId === executionId &&
    run.planRequestId === planRequestId &&
    query.planRuns.includes(run);
  try {
    const plan = await api.plan(executionId);
    if (!current()) return;
    if (plan.executionId !== executionId || plan.consoleId !== consoleId || plan.requestId !== planRequestId)
      throw new Error("Plan identity does not match the execution");
    run.plan = plan;
    run.state = "loaded";
  } catch (cause) {
    if (current()) {
      run.error = cause instanceof Error ? cause.message : String(cause);
      run.state = "failed";
    }
  }
}

export interface GoResultLoadingSettings {
  mode: "page" | "continuous";
  batchSize: number;
}
export function normalizeResultLoading(value: unknown): GoResultLoadingSettings {
  const saved = value && typeof value === "object" ? (value as Partial<GoResultLoadingSettings>) : {};
  return {
    mode: saved.mode === "continuous" ? "continuous" : "page",
    batchSize:
      Number.isInteger(saved.batchSize) && saved.batchSize! > 0 && saved.batchSize! <= 1000 ? saved.batchSize! : 50
  };
}
export function useResultLoadingPreferences() {
  return useStorage<GoResultLoadingSettings>(
    "jumpserver-client:chen-result-loading",
    normalizeResultLoading(null),
    undefined,
    {
      serializer: {
        read: (raw) => {
          try {
            return normalizeResultLoading(JSON.parse(raw));
          } catch {
            return normalizeResultLoading(null);
          }
        },
        write: (value) => JSON.stringify(normalizeResultLoading(value))
      },
      onError: () => {}
    }
  );
}
export function resultLoadingLocked(query: QueryWorkspaceTab, allowStale = false) {
  return (
    query.closed ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.loadingRows ||
    !!query.pending ||
    executionActive(query.execution) ||
    query.edit.busy ||
    (!allowStale && query.edit.refreshRequired) ||
    editDirty(query.edit)
  );
}
export function hasMoreResultRows(query: QueryWorkspaceTab) {
  const rows = query.rows;
  if (!rows || query.loadingSettings.mode !== "continuous") return false;
  // Cached rows may still be unread after a recoverable HTTP failure.
  if (rows.next_offset !== undefined) return true;
  return (
    rows.browse?.supported === true &&
    rows.browse.has_more === true &&
    !rows.browse.limit_reached &&
    !rows.truncated &&
    rows.rows.length < (rows.browse.max_loaded_rows || 10000)
  );
}

// COUNT values are decimal strings: never round a large count through Number.
export function lastPageOffset(total: string | undefined, pageSize: number, maxOffset: number): number | null {
  if (
    !total ||
    !/^\d+$/.test(total) ||
    !Number.isSafeInteger(pageSize) ||
    pageSize <= 0 ||
    !Number.isSafeInteger(maxOffset) ||
    maxOffset < 0
  )
    return null;
  const count = BigInt(total);
  const size = BigInt(pageSize);
  const offset = count > 0n ? ((count - 1n) / size) * size : 0n;
  return offset <= BigInt(maxOffset) ? Number(offset) : null;
}
