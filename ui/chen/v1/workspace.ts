import type {
  ChenGoApi,
  GoBrowseDraft,
  GoBrowseRequest,
  GoPlan,
  GoCatalogObject,
  GoConsole,
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

export interface QueryContext {
  database: string;
  schema: string;
}
export interface QueryWorkspaceTab {
  id: string;
  kind: "query" | "preview";
  title: string;
  sql: string;
  baselineSql: string;
  context: QueryContext;
  console: GoConsole | null;
  execution: GoExecution | null;
  executionSql: string;
  executionVersion: number;
  executionPlan: boolean;
  resultPane: "results" | "plan";
  plan: GoPlan | null;
  planAttempt: GoPlan | null;
  planLoadedId: string;
  loadingPlan: boolean;
  planLoadError: string;
  executionConfirmWarnings: boolean;
  executionSubmitReview: boolean;
  executionExportFormat?: GoExportFormat;
  browseObject?: GoCatalogObject;
  loadingSettings: GoResultLoadingSettings;
  pendingLoading: GoResultLoadingSettings | null;
  loadMoreFailed: boolean;
  browseDraft: GoBrowseDraft;
  browseCount: { source_result_id: string; total: string } | null;
  edit: GoEditDraft;
  executionEditPlan?: string;
  executionBrowse?: GoBrowseRequest;
  exportJob: GoExport | null;
  exportBusy: boolean;
  pendingCachedExport: { resultId: string; format: GoExportFormat; id: string; rows?: number } | null;
  resultExecution: GoExecution | null;
  resultSql: string;
  rows: GoRows | null;
  resultId: string;
  pending: {
    sql: string;
    version: number;
    id: string;
    submitReview?: boolean;
    confirmWarnings?: boolean;
    plan?: boolean;
    exportFormat?: GoExportFormat;
    editPlanId?: string;
    browse?: GoBrowseRequest;
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
export interface ObjectWorkspaceTab {
  id: string;
  kind: "object";
  title: string;
  object: GoCatalogObject;
}
export type ChenWorkspaceTab = QueryWorkspaceTab | ObjectWorkspaceTab;

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
    executionPlan: false,
    resultPane: "results",
    plan: null,
    planAttempt: null,
    planLoadedId: "",
    loadingPlan: false,
    planLoadError: "",
    executionConfirmWarnings: false,
    executionSubmitReview: false,
    edit: createEditDraft(),
    loadingSettings: { mode: "page", batchSize: 200 },
    pendingLoading: null,
    loadMoreFailed: false,
    browseDraft: { where: "", sort: [], page_size: 200 },
    browseCount: null,
    exportJob: null,
    exportBusy: false,
    pendingCachedExport: null,
    resultExecution: null,
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
      return `SELECT TOP (200) * FROM ${name};`;
    case "fetch":
      return `SELECT * FROM ${name} FETCH FIRST 200 ROWS ONLY;`;
    // ROWNUM also supports Oracle versions before the FETCH FIRST clause.
    case "rownum":
      return `SELECT * FROM ${name} WHERE ROWNUM <= 200;`;
    default:
      return `SELECT * FROM ${name} LIMIT 200;`;
  }
}
export function tabContext(tab: ChenWorkspaceTab | undefined, fallback: QueryContext): QueryContext {
  if (!tab) return { ...fallback };
  if (tab.kind === "object") return { database: tab.object.database, schema: tab.object.schema };
  return { ...tab.context };
}
export function queryDirty(query: QueryWorkspaceTab) {
  return query.sql !== query.baselineSql || editDirty(query.edit);
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
    ...(query.executionEditPlan ? { editPlanId: query.executionEditPlan } : {}),
    ...(query.executionExportFormat ? { exportFormat: query.executionExportFormat } : {}),
    ...(query.executionPlan ? { plan: true } : {}),
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
    ...(query.executionEditPlan ? { editPlanId: query.executionEditPlan } : {}),
    ...(query.executionExportFormat ? { exportFormat: query.executionExportFormat } : {}),
    ...(query.executionPlan ? { plan: true } : {}),
    ...(query.executionSubmitReview ? { submitReview: true } : {})
  };
}
export function closeQuerySession(query: QueryWorkspaceTab) {
  if (query.console) query.console.state = "closed";
  if (executionActive(query.execution)) query.execution = { ...query.execution!, status: "unknown" };
  query.loadGeneration++;
  query.loadingRows = false;
  query.loadingPlan = false;
}
export function acceptQueryExecution(query: QueryWorkspaceTab, value: GoExecution) {
  if (query.closed || value.console_id !== query.console?.id || query.pending) return false;
  if (query.execution && value.id !== query.execution.id) return false;
  query.execution = reconcileExecution(query.execution, value);
  query.executionPlan = !!query.execution.plan;
  if (query.resultExecution?.id === value.id) query.resultExecution = reconcileExecution(query.resultExecution, value);
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
    transaction: queries.some((query) => query.console && query.console.state !== "closed")
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

// Plan resources belong to an execution and its original console. Late responses
// must not replace another submission, reconnect, closed tab or previous result.
export async function loadQueryPlan(query: QueryWorkspaceTab, api: Pick<ChenGoApi, "plan">) {
  const execution = query.execution;
  if (!execution?.plan || executionActive(execution) || query.loadingPlan || query.closed || query.pending) return;
  const generation = query.loadGeneration;
  const consoleId = query.console?.id;
  query.loadingPlan = true;
  query.planLoadError = "";
  const current = () =>
    !query.closed &&
    !query.pending &&
    query.loadGeneration === generation &&
    query.execution?.id === execution.id &&
    query.console?.id === consoleId;
  try {
    const plan = await api.plan(execution.id);
    if (!current()) return;
    if (
      plan.executionId !== execution.id ||
      plan.consoleId !== consoleId ||
      plan.requestId !== execution.plan.request_id
    )
      throw new Error("Plan identity does not match the execution");
    query.planLoadedId = execution.id;
    query.planAttempt = plan;
    if (plan.status === "SUCCESS" || plan.status === "RAW_ONLY") query.plan = plan;
  } catch (cause) {
    if (current()) {
      query.planLoadedId = execution.id;
      query.planLoadError = cause instanceof Error ? cause.message : String(cause);
    }
  } finally {
    if (current()) query.loadingPlan = false;
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
      Number.isInteger(saved.batchSize) && saved.batchSize! > 0 && saved.batchSize! <= 1000 ? saved.batchSize! : 200
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
export function resultLoadingLocked(query: QueryWorkspaceTab) {
  return (
    query.closed ||
    query.console?.state !== "ready" ||
    query.busy ||
    query.loadingRows ||
    !!query.pending ||
    executionActive(query.execution) ||
    query.edit.busy ||
    query.edit.refreshRequired ||
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
