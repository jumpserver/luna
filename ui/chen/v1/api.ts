import { buildHeaders, chenPath } from "~/chen/api/client";
import { newChenRequestId } from "./requestId";
import type { ChenSqlDialect } from "~/chen/utils/sqlDialect";

export interface GoSession {
  id: string;
  dialect: ChenSqlDialect;
  asset: string;
  account: string;
  permissions: { can_copy: boolean; can_paste: boolean; can_upload: boolean; can_download: boolean };
  expires_at: string;
  state: string;
  can_cancel?: boolean;
}
export interface GoConsole {
  id: string;
  database: string;
  schema: string;
  state: string;
}
export interface GoExecution {
  id: string;
  console_id: string;
  status: "queued" | "running" | "cancel_requested" | "succeeded" | "failed" | "canceled" | "unknown";
  result_ids: string[];
  statement_results: { result_id?: string; rows_affected?: string }[];
  error?: { code: string; message: string };
  audit_status: "pending" | "recorded" | "failed";
  started_at?: string;
  finished_at?: string;
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
  statements: { from: number; to: number; kind: string }[];
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
      credentials: single ? "omit" : "include",
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
    openConsole: (sessionId: string, context: { database?: string; schema?: string } = {}) =>
      request<GoConsole>(`/sessions/${id(sessionId)}/consoles`, "POST", context),
    closeConsole: (consoleId: string) => request<void>(`/consoles/${id(consoleId)}`, "DELETE"),
    execute: (consoleId: string, sql: string, documentVersion: number, requestId: string) =>
      request<GoExecution>(`/consoles/${id(consoleId)}/executions`, "POST", {
        sql,
        document_version: documentVersion,
        request_id: requestId
      }),
    execution: (executionId: string) => request<GoExecution>(`/executions/${id(executionId)}`),
    cancel: (executionId: string) => request<GoExecution>(`/executions/${id(executionId)}/cancel`, "POST"),
    rows: (resultId: string, offset = 0, limit = 200) =>
      request<GoRows>(`/results/${id(resultId)}/rows?offset=${offset}&limit=${limit}`),
    relations: (consoleId: string, prefix = "") =>
      request<{ items: GoRelation[] }>(`/consoles/${id(consoleId)}/relations?prefix=${id(prefix)}`),
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
        credentials: single ? "omit" : "include",
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
  return !!execution && ["queued", "running", "cancel_requested"].includes(execution.status);
}

export function executionCanCancel(execution: GoExecution | null | undefined, capability?: boolean) {
  return capability !== false && executionActive(execution) && execution?.status !== "cancel_requested";
}

// An earlier HTTP response may arrive after a terminal SSE event.
export function reconcileExecution(current: GoExecution | null, next: GoExecution) {
  if (!current || current.id !== next.id) return next;
  if (!executionActive(current) && executionActive(next)) return current;
  if (current.status === "cancel_requested" && ["queued", "running"].includes(next.status)) return current;
  if (current.audit_status === "recorded" && next.audit_status !== "recorded") {
    return { ...next, audit_status: current.audit_status };
  }
  return next;
}
