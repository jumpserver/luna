import type { ChenExecutionPlan } from "~/chen/types/plan";
import type { ChenSqlDialect } from "~/chen/utils/sqlDialect";
import { buildHeaders, chenPath } from "~/chen/api/client";
import { newChenRequestId } from "./requestId";

export interface GoSession {
  id: string;
  dialect: ChenSqlDialect;
  asset: string;
  account: string;
  permissions: { can_copy: boolean; can_paste: boolean; can_upload: boolean; can_download: boolean };
  expires_at: string;
  state: string;
  state_reason?: string;
  can_cancel?: boolean;
}
export interface GoConsole {
  id: string;
  database: string;
  schema: string;
  state: string;
}
export interface GoPlanIdentity {
  request_id: string;
  mode: "ESTIMATED";
  dialect: string;
  database: string;
  schema: string;
  generated_sql?: string;
}
export interface GoPlan extends ChenExecutionPlan {
  executionId: string;
  consoleId: string;
  context: GoPlanIdentity;
  limits: { maxBytes: number; maxNodes: number; maxDepth: number };
}
export interface GoExecution {
  plan?: GoPlanIdentity;
  id: string;
  export_id?: string;
  sql?: string;
  edit?: {
    plan_id: string;
    changes_applied: boolean;
    database_committed: boolean;
    outcome: "committed" | "staged" | "rolled_back" | "unknown";
    affected_rows: number;
    refresh_required: boolean;
  };
  console_id: string;
  status:
    | "queued"
    | "waiting_review"
    | "running"
    | "cancel_requested"
    | "succeeded"
    | "failed"
    | "canceled"
    | "unknown";
  review?: {
    state: "pending" | "approved" | "rejected" | "canceled" | "timed_out" | "failed";
    ticket_url?: string;
    reviewers?: string[];
    processor?: string;
    expires_at?: string;
    error_code?: string;
  };
  result_ids: string[];
  statement_results: { result_id?: string; rows_affected?: string }[];
  error?: { code: string; message: string };
  audit_status: "pending" | "recorded" | "failed";
  started_at?: string;
  finished_at?: string;
}
export type GoExportFormat = "csv" | "xlsx";
export interface GoExport {
  id: string;
  execution_id?: string;
  console_id?: string;
  format: GoExportFormat;
  mode: "query" | "cached";
  status: GoExecution["status"] | "expired";
  rows: number;
  bytes: number;
  ready: boolean;
  truncated: boolean;
  error?: { code: string; message: string };
  expires_at?: string;
  limits: { max_rows: number; max_bytes: number; max_cell_chars: number; max_duration_seconds?: number };
}
export interface GoDownloadTicket {
  download_url: string;
  method: "POST";
  fields: { ticket: string };
  expires_at: string;
}
export interface GoRows {
  id: string;
  columns: { name: string; data_type: string }[];
  rows: unknown[][];
  offset: number;
  total_rows: number;
  truncated: boolean;
  next_offset?: number;
}
export interface GoCopySelection {
  rows: number[];
  columns: number[];
}
export interface GoCopiedSQL {
  sql: string;
  row_count: number;
  notes: string[];
}
export interface GoEditColumn {
  index: number;
  name: string;
  data_type: string;
  editable: boolean;
  insertable: boolean;
  nullable: boolean;
  primary_key: boolean;
  generated: boolean;
  has_default?: boolean;
  default_value?: string;
  reason?: string;
}
export interface GoEditMetadata {
  supported: boolean;
  reason?: string;
  mode: "query" | "table";
  schema: string;
  table: string;
  columns: GoEditColumn[];
  row_refs: string[];
  offset?: number;
  version: string | number;
}
export interface GoEditChange {
  op: "update" | "insert" | "delete";
  row_ref?: string;
  values?: Record<string, string | null>;
}
export interface GoEditPlan {
  plan_id: string;
  sql: string;
  change_count: number;
  update_count: number;
  insert_count: number;
  delete_count: number;
  expires_at: string;
}
export interface GoCompletion {
  document_version: number;
  from: number;
  to: number;
  items: {
    label: string;
    insert_text: string;
    kind: string;
    detail?: string;
    documentation?: string;
    filter_text?: string;
    sort_text?: string;
  }[];
}
export interface GoAnalysis {
  document_version: number;
  statements: { from: number; to: number; kind: string; may_write?: boolean; returns_rows?: boolean }[];
}
export interface GoRelation {
  schema: string;
  name: string;
  kind: string;
}
export interface GoCatalogObject {
  database: string;
  schema: string;
  name: string;
  kind: "table" | "view";
  comment?: string;
}
export interface GoCatalogColumn {
  name: string;
  data_type: string;
  nullable: boolean;
  comment?: string;
}
export interface GoCatalogSection {
  supported: boolean;
  deferred?: boolean;
  truncated?: boolean;
  items?: Record<string, string | number | boolean>[];
  text?: string;
  source?: string;
  error?: string | { code?: string; message?: string };
}
export interface GoCatalogInspect {
  column_ordinals?: Record<string, number>;
  columns_restricted?: boolean;
  database: string;
  schema: string;
  table: string;
  columns: GoCatalogColumn[];
  sections: Record<"primary_key" | "foreign_keys" | "indexes" | "defaults" | "ddl", GoCatalogSection>;
  truncated: boolean;
}
export interface GoCatalogPage<T> {
  database?: string;
  items: T[];
  next_cursor?: string;
  has_more: boolean;
}
export interface GoEvent {
  sequence: number;
  type: string;
  data: unknown;
}
export interface GoCapabilities {
  mode: "single" | "managed";
}

export class ChenGoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export function createChenGoApi(
  endpointUrl: string,
  fetchImpl: typeof fetch = fetch,
  options: { mode?: "single" | "managed" } = {}
) {
  // Chen authenticates with explicit tokens, never ambient Core cookies, including across endpoints.
  // This token stays in the workspace closure: no URL, localStorage or query-string credentials.
  let token = "";
  const authenticationRequestId = newChenRequestId();
  const single = options.mode === "single";
  function headers(mutation = false): HeadersInit {
    if (single) return token ? { token } : {};
    return buildHeaders(token, mutation ? getWebApiMutationHeaders() : {});
  }
  async function check(response: Response) {
    if (response.ok) return;
    let error: { code?: string; message?: string } = {};
    try {
      error = (await response.json()).error || {};
    } catch {
      /* Do not expose upstream HTML or secrets. */
    }
    throw new ChenGoError(
      error.code || "http_error",
      error.message || `Chen request failed (${response.status})`,
      response.status
    );
  }
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
    extraHeaders: HeadersInit = {}
  ): Promise<T> {
    const response = await fetchImpl(chenPath(`/api/v1${path}`, endpointUrl), {
      method,
      credentials: "omit",
      signal,
      headers: {
        ...headers(method !== "GET"),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    await check(response);
    if (response.status === 204) return undefined as T;
    return response.json();
  }
  const id = encodeURIComponent;
  function catalogQuery(values: Record<string, string | number | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
    return query.toString();
  }
  return {
    async authenticate(connectToken: string) {
      if (single)
        throw new ChenGoError("mode_mismatch", "Direct connection mode does not accept a Core connection token", 400);
      const response = await request<{ token: string; session: GoSession }>(
        "/sessions",
        "POST",
        { connect_token: connectToken, request_id: authenticationRequestId },
        undefined,
        { "Idempotency-Key": authenticationRequestId }
      );
      token = response.token;
      return response.session;
    },
    async authenticateSelector(selector: string) {
      if (!single) throw new ChenGoError("mode_mismatch", "Managed mode requires a Core connection token", 400);
      const capabilities = await request<GoCapabilities>("/capabilities");
      if (capabilities.mode !== "single")
        throw new ChenGoError("mode_mismatch", "Direct database selection is unavailable on this service", 409);
      const response = await request<{ token: string; session: GoSession }>("/sessions", "POST", {
        selector,
        request_id: authenticationRequestId
      });
      token = response.token;
      return response.session;
    },
    getSession: (sessionId: string) => request<GoSession>(`/sessions/${id(sessionId)}`),
    closeSession: (sessionId: string) => request<void>(`/sessions/${id(sessionId)}`, "DELETE"),
    aiManifest: (sessionId: string, signal?: AbortSignal) =>
      request<unknown>(`/sessions/${id(sessionId)}/ai/manifest`, "GET", undefined, signal),
    aiMessage: (sessionId: string, frame: unknown, signal?: AbortSignal) =>
      request<void>(`/sessions/${id(sessionId)}/ai/messages`, "POST", frame, signal),
    openConsole: (sessionId: string, context: { database?: string; schema?: string } = {}) =>
      request<GoConsole>(`/sessions/${id(sessionId)}/consoles`, "POST", context),
    closeConsole: (consoleId: string) => request<void>(`/consoles/${id(consoleId)}`, "DELETE"),
    execute: (
      consoleId: string,
      sql: string,
      documentVersion: number,
      requestId: string,
      submitReview = false,
      confirmWarnings = false,
      estimatedPlan = false
    ) =>
      request<GoExecution>(`/consoles/${id(consoleId)}/executions`, "POST", {
        sql,
        ...(estimatedPlan ? { plan_mode: "ESTIMATED" } : {}),
        document_version: documentVersion,
        request_id: requestId,
        ...(submitReview ? { submit_review: true } : {}),
        ...(confirmWarnings ? { confirm_warnings: true } : {})
      }),
    browse: (
      consoleId: string,
      schema: string,
      table: string,
      requestId: string,
      submitReview = false,
      confirmWarnings = false
    ) =>
      request<GoExecution>(`/consoles/${id(consoleId)}/browse`, "POST", {
        schema,
        table,
        request_id: requestId,
        ...(submitReview ? { submit_review: true } : {}),
        ...(confirmWarnings ? { confirm_warnings: true } : {})
      }),
    editMetadata: (consoleId: string, resultId: string, offset = 0, limit = 200, signal?: AbortSignal) =>
      request<GoEditMetadata>(
        `/consoles/${id(consoleId)}/results/${id(resultId)}/edit?offset=${offset}&limit=${limit}`,
        "GET",
        undefined,
        signal
      ),
    copySQL: (
      consoleId: string,
      resultId: string,
      operation: "insert" | "update",
      selection: GoCopySelection,
      signal?: AbortSignal
    ) =>
      request<GoCopiedSQL>(
        `/consoles/${id(consoleId)}/results/${id(resultId)}/copy-sql`,
        "POST",
        { operation, ...selection },
        signal
      ),
    previewEdits: (consoleId: string, resultId: string, changes: GoEditChange[], source: "grid" | "csv" = "grid") =>
      request<GoEditPlan>(`/consoles/${id(consoleId)}/results/${id(resultId)}/edits/preview`, "POST", {
        changes,
        source
      }),
    applyEdits: (consoleId: string, planId: string, requestId: string, submitReview = false, confirmWarnings = false) =>
      request<GoExecution>(`/consoles/${id(consoleId)}/edits/${id(planId)}/apply`, "POST", {
        request_id: requestId,
        ...(submitReview ? { submit_review: true } : {}),
        ...(confirmWarnings ? { confirm_warnings: true } : {})
      }),
    plan: (executionId: string) => request<GoPlan>(`/executions/${id(executionId)}/plan`),
    explain: (consoleId: string, sql: string) =>
      request<{ sql: string }>(`/consoles/${id(consoleId)}/explain`, "POST", { sql }),
    exportQuery: (
      consoleId: string,
      sql: string,
      documentVersion: number,
      requestId: string,
      format: GoExportFormat,
      submitReview = false,
      confirmWarnings = false
    ) =>
      request<GoExecution>(`/consoles/${id(consoleId)}/exports`, "POST", {
        sql,
        document_version: documentVersion,
        request_id: requestId,
        format,
        ...(submitReview ? { submit_review: true } : {}),
        ...(confirmWarnings ? { confirm_warnings: true } : {})
      }),
    exportCached: (resultId: string, format: GoExportFormat, requestId: string) =>
      request<GoExport>(`/results/${id(resultId)}/exports`, "POST", { format, request_id: requestId }),
    getExport: (exportId: string) => request<GoExport>(`/exports/${id(exportId)}`),
    cancelExport: (exportId: string) => request<GoExport>(`/exports/${id(exportId)}/cancel`, "POST"),
    deleteExport: (exportId: string) => request<void>(`/exports/${id(exportId)}`, "DELETE"),
    async exportDownloadTicket(exportId: string) {
      const value = await request<GoDownloadTicket>(`/exports/${id(exportId)}/download-ticket`, "POST");
      // Only the connector's fixed download route may receive this one-use credential.
      if (value.method !== "POST" || value.download_url !== "/chen/api/v1/downloads" || !value.fields?.ticket)
        throw new ChenGoError("invalid_download_ticket", "Invalid export download response", 502);
      return { ...value, download_url: chenPath("/api/v1/downloads", endpointUrl) };
    },
    execution: (executionId: string) => request<GoExecution>(`/executions/${id(executionId)}`),
    cancel: (executionId: string) => request<GoExecution>(`/executions/${id(executionId)}/cancel`, "POST"),
    rows: (resultId: string, offset = 0, limit = 200) =>
      request<GoRows>(`/results/${id(resultId)}/rows?offset=${offset}&limit=${limit}`),
    relations: (consoleId: string, prefix = "") =>
      request<{ items: GoRelation[] }>(`/consoles/${id(consoleId)}/relations?prefix=${id(prefix)}`),
    catalogDdl: (sessionId: string, schema: string, table: string, signal?: AbortSignal) =>
      request<GoCatalogSection>(
        `/sessions/${id(sessionId)}/catalog/ddl?${catalogQuery({ schema, table })}`,
        "GET",
        undefined,
        signal
      ),
    catalogInspect: (sessionId: string, schema: string, table: string, signal?: AbortSignal) =>
      request<GoCatalogInspect>(
        `/sessions/${id(sessionId)}/catalog/inspect?${catalogQuery({ schema, table })}`,
        "GET",
        undefined,
        signal
      ),
    catalogSchemas: (sessionId: string, cursor?: string, signal?: AbortSignal) =>
      request<GoCatalogPage<{ name: string }>>(
        `/sessions/${id(sessionId)}/catalog/schemas?${catalogQuery({ cursor, limit: 100 })}`,
        "GET",
        undefined,
        signal
      ),
    catalogObjects: (
      sessionId: string,
      options: { schema?: string; kind?: string; q?: string; cursor?: string } = {},
      signal?: AbortSignal
    ) =>
      request<GoCatalogPage<GoCatalogObject>>(
        `/sessions/${id(sessionId)}/catalog/objects?${catalogQuery({ ...options, limit: 100 })}`,
        "GET",
        undefined,
        signal
      ),
    catalogColumns: (sessionId: string, schema: string, table: string, cursor?: string, signal?: AbortSignal) =>
      request<GoCatalogPage<GoCatalogColumn>>(
        `/sessions/${id(sessionId)}/catalog/columns?${catalogQuery({ schema, table, cursor, limit: 100 })}`,
        "GET",
        undefined,
        signal
      ),
    complete: (consoleId: string, document: string, position: number, version: number, signal?: AbortSignal) =>
      request<GoCompletion>(
        `/consoles/${id(consoleId)}/completion`,
        "POST",
        { document, position_utf16: position, document_version: version },
        signal
      ),
    analyze: (consoleId: string, document: string, version: number, signal?: AbortSignal) =>
      request<GoAnalysis>(
        `/consoles/${id(consoleId)}/analysis`,
        "POST",
        { document, document_version: version },
        signal
      ),
    async events(sessionId: string, after: number, signal: AbortSignal) {
      const response = await fetchImpl(chenPath(`/api/v1/sessions/${id(sessionId)}/events`, endpointUrl), {
        credentials: "omit",
        signal,
        headers: { ...headers(), Accept: "text/event-stream", ...(after ? { "Last-Event-ID": String(after) } : {}) }
      });
      await check(response);
      if (!response.headers.get("content-type")?.includes("text/event-stream") || !response.body) {
        throw new ChenGoError("invalid_stream", "Chen event stream is unavailable", response.status);
      }
      return response.body;
    }
  };
}

export type ChenGoApi = ReturnType<typeof createChenGoApi>;
export function executionActive(execution: GoExecution | null | undefined) {
  return !!execution && ["queued", "waiting_review", "running", "cancel_requested"].includes(execution.status);
}

export function executionCanCancel(execution: GoExecution | null | undefined, capability?: boolean) {
  return (
    (capability !== false || execution?.status === "waiting_review") &&
    executionActive(execution) &&
    execution?.status !== "cancel_requested"
  );
}

// An earlier HTTP response may arrive after a terminal SSE event.
export function reconcileExecution(current: GoExecution | null, next: GoExecution) {
  if (!current || current.id !== next.id) return next;
  if (!executionActive(current) && executionActive(next)) return current;
  if (current.status === "cancel_requested" && executionActive(next)) return current;
  if (current.status === "running" && ["queued", "waiting_review"].includes(next.status)) return current;
  if (current.status === "waiting_review" && next.status === "queued") return current;
  if (current.audit_status === "recorded" && next.audit_status !== "recorded") {
    return { ...next, audit_status: current.audit_status };
  }
  return next;
}
