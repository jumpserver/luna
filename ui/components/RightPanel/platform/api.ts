import type { ApiRequest } from "~/composables/useApiRequest";
import { ApiRequestError, apiRequest } from "~/composables/useApiRequest";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { getWebApiHeaders, isDesktopRuntime, withWebSitePrefix } from "~/utils/runtime";
import { createEventStreamParser } from "./sse";
import type { PlatformAiStreamEvent } from "./sse";

export type { PlatformAiStreamEvent } from "./sse";

const KAEL_API_ROOT = "/kael/api/v1";
const PAGE_SIZE = 100;

function platformAiRequest<T>(request: Omit<ApiRequest, "service">) {
  return apiRequest<T>({ ...request, service: "kael" });
}

export interface PlatformAiAssistant {
  key: string;
  name: string;
  description?: string;
  starter_prompts?: string[];
}

export interface PlatformAiConversation {
  id: string;
  kind?: "general" | "capability";
  title?: string;
  assistant?: string;
  profile?: string;
  surface?: string;
  status?: string;
  date_created?: string;
  date_updated?: string;
}

export interface PlatformAiResultCard {
  type?: string;
  title?: string;
  source?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

export interface PlatformAiMessage {
  id: string;
  role: "assistant" | "user" | "system" | "tool";
  content: string;
  status?: string;
  error?: string;
  result_cards?: PlatformAiResultCard[];
  date_created?: string;
}

export interface PlatformAiApproval {
  id: string;
  approval_id?: string;
  status?: string;
  operation_id?: string;
  method?: string;
  path?: string;
  risk_level?: string;
  preview?: unknown;
  expires_at?: string;
  [key: string]: unknown;
}

interface Page<T> {
  results?: T[];
  next?: string | null;
  count?: number;
}

interface KaelProfile {
  id: string;
  name: string;
  description?: string;
  conversation_kind: "general" | "capability";
  starter_prompts?: string[];
}

interface KaelPanel {
  id: string;
  cursor?: number;
}

interface KaelRun {
  id: string;
  state: string;
  output_message_id?: string;
}

interface PlatformBinding {
  panelId: string;
  cursor: number;
  activeRunId: string;
  heartbeat: ReturnType<typeof setInterval>;
}

interface DesktopApiStreamEvent {
  streamId: string;
  type: "chunk" | "done" | "error";
  chunk?: string;
  error?: string;
}

const bindings = new Map<string, PlatformBinding>();

export class PlatformAiRequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = ""
  ) {
    super(message);
    this.name = "PlatformAiRequestError";
  }
}

export function serverResults<T>(response: T[] | Page<T>): T[] {
  return Array.isArray(response) ? response : response.results || [];
}

export function platformConversationResults(
  response: PlatformAiConversation[] | Page<PlatformAiConversation>
): PlatformAiConversation[] {
  const ids = new Set<string>();
  return serverResults(response).filter((conversation) => {
    if (!conversation.id || conversation.kind !== "general" || conversation.status === "deleted") return false;
    if (ids.has(conversation.id)) return false;
    ids.add(conversation.id);
    return true;
  });
}

export function listPlatformAiConversations() {
  return platformAiRequest<PlatformAiConversation[] | Page<PlatformAiConversation>>({
    method: "GET",
    path: `${KAEL_API_ROOT}/conversations`,
    query: { kind: "general", limit: PAGE_SIZE }
  });
}

export function createPlatformAiConversation(assistant: string) {
  return platformAiRequest<PlatformAiConversation>({
    method: "POST",
    path: `${KAEL_API_ROOT}/conversations`,
    body: { kind: "general", assistant, profile: assistant, surface: "general.chat" }
  });
}

async function closeBinding(conversationId: string) {
  const binding = bindings.get(conversationId);
  if (!binding) return;
  clearInterval(binding.heartbeat);
  bindings.delete(conversationId);
  await platformAiRequest<void>({
    method: "DELETE",
    path: `${KAEL_API_ROOT}/panel-sessions/${encodeURIComponent(binding.panelId)}`
  }).catch(() => undefined);
}

export async function updatePlatformAiConversation(id: string, body: { assistant?: string; title?: string }) {
  if (body.assistant) await closeBinding(id);
  return platformAiRequest<PlatformAiConversation>({
    method: "PATCH",
    path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(id)}`,
    body
  });
}

export async function deletePlatformAiConversation(id: string) {
  await closeBinding(id);
  return platformAiRequest<void>({
    method: "DELETE",
    path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(id)}`
  });
}

export async function listPlatformAiAssistants() {
  const response = await platformAiRequest<KaelProfile[] | Page<KaelProfile>>({
    method: "GET",
    path: `${KAEL_API_ROOT}/assistants`
  });
  const results = serverResults(response)
    .filter((profile) => profile.conversation_kind === "general")
    .map((profile) => ({
      key: profile.id.replace(/^platform\./, ""),
      name: profile.name,
      description: profile.description,
      starter_prompts: profile.starter_prompts || []
    }));
  return { results, count: results.length };
}

export async function listPlatformAiMessages(id: string) {
  const messages: PlatformAiMessage[] = [];
  let offset = 0;
  while (true) {
    const response = await platformAiRequest<Page<PlatformAiMessage>>({
      method: "GET",
      path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(id)}/messages`,
      query: { limit: PAGE_SIZE, offset }
    });
    const page = serverResults(response);
    messages.push(...page);
    offset += page.length;
    if (!page.length || offset >= Number(response.count || 0)) break;
  }
  return messages;
}

async function ensurePanel(conversationId: string) {
  const current = bindings.get(conversationId);
  if (current) return current;
  const panel = await platformAiRequest<KaelPanel>({
    method: "POST",
    path: `${KAEL_API_ROOT}/panel-sessions`,
    body: {
      conversation_id: conversationId,
      surface: "general.chat",
      client_instance_id: globalThis.crypto?.randomUUID?.() || `luna-${Date.now()}`
    }
  });
  const binding: PlatformBinding = {
    panelId: panel.id,
    cursor: 0,
    activeRunId: "",
    heartbeat: setInterval(() => {
      void platformAiRequest({
        method: "POST",
        path: `${KAEL_API_ROOT}/panel-sessions/${encodeURIComponent(panel.id)}/heartbeat`
      }).catch(() => undefined);
    }, 60_000)
  };
  bindings.set(conversationId, binding);
  return binding;
}

export async function cancelPlatformAiConversation(id: string) {
  const binding = bindings.get(id);
  let runId = binding?.activeRunId || "";
  if (!runId) {
    const response = await platformAiRequest<Page<KaelRun>>({
      method: "GET",
      path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(id)}/runs`,
      query: { limit: 50 }
    });
    runId = serverResults(response).find((run) => !["completed", "failed", "cancelled"].includes(run.state))?.id || "";
  }
  if (!runId) return;
  await platformAiRequest<void>({
    method: "POST",
    path: `${KAEL_API_ROOT}/runs/${encodeURIComponent(runId)}/cancel`,
    body: { reason: "user" }
  });
  if (binding?.activeRunId === runId) binding.activeRunId = "";
}

export async function getPlatformAiApproval(id: string) {
  const approval = await platformAiRequest<PlatformAiApproval & { risk?: string }>({
    method: "GET",
    path: `${KAEL_API_ROOT}/approvals/${encodeURIComponent(id)}`
  });
  return { ...approval, risk_level: approval.risk_level || approval.risk };
}

export function confirmPlatformAiApproval(id: string) {
  return platformAiRequest<void>({
    method: "POST",
    path: `${KAEL_API_ROOT}/approvals/${encodeURIComponent(id)}/decisions`,
    body: { decision: "approve" }
  });
}

export function rejectPlatformAiApproval(id: string) {
  return platformAiRequest<void>({
    method: "POST",
    path: `${KAEL_API_ROOT}/approvals/${encodeURIComponent(id)}/decisions`,
    body: { decision: "reject" }
  });
}

function abortError() {
  const error = new Error("The request was aborted");
  error.name = "AbortError";
  return error;
}

function waitForRetry(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true }
    );
  });
}

function parseStreamError(message: string) {
  const match = message.match(/api stream request failed: status=(\d+), body=([\s\S]*)/);
  if (!match) return new PlatformAiRequestError(message);
  let body: any = match[2];
  try {
    body = JSON.parse(body);
  } catch {
    // Keep plain-text transport errors readable.
  }
  return new PlatformAiRequestError(body?.detail || body?.code || String(body), Number(match[1]), body?.code || "");
}

async function streamInDesktop(
  request: ApiRequest,
  signal: AbortSignal,
  onEvent: (event: PlatformAiStreamEvent) => void
) {
  const streamId = globalThis.crypto?.randomUUID?.() || `kael-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parser = createEventStreamParser(onEvent);
  let resolveStream!: () => void;
  let rejectStream!: (error: unknown) => void;
  let settled = false;
  const completion = new Promise<void>((resolve, reject) => {
    resolveStream = resolve;
    rejectStream = reject;
  });
  const settle = (error?: unknown) => {
    if (settled) return;
    settled = true;
    if (error) rejectStream(error);
    else resolveStream();
  };
  const unlisten = await desktopListen<DesktopApiStreamEvent>("api-stream", ({ payload }) => {
    if (payload.streamId !== streamId) return;
    if (payload.type === "chunk") parser.push(payload.chunk || "");
    if (payload.type === "done") {
      parser.finish();
      settle();
    }
    if (payload.type === "error") settle(parseStreamError(payload.error || "Kael stream failed"));
  });
  const onAbort = () => {
    void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
    settle(abortError());
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw abortError();
    await desktopInvoke("api_stream_start", { streamId, request });
    await completion;
  } finally {
    signal.removeEventListener("abort", onAbort);
    unlisten();
    void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
  }
}

async function responseError(response: Response) {
  const text = await response.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* Keep text. */
  }
  throw new PlatformAiRequestError(
    data?.detail || data?.code || text || `Kael request failed with HTTP ${response.status}`,
    response.status,
    data?.code || ""
  );
}

async function streamInBrowser(
  request: ApiRequest,
  signal: AbortSignal,
  onEvent: (event: PlatformAiStreamEvent) => void
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(request.query || {})) query.set(key, String(value));
  const response = await fetch(`${withWebSitePrefix(request.path)}?${query}`, {
    method: request.method,
    credentials: "include",
    headers: { ...getWebApiHeaders(request.orgId), Accept: "text/event-stream", ...(request.headers || {}) },
    signal
  });
  if (!response.ok) await responseError(response);
  if (!response.body) throw new PlatformAiRequestError("Streaming is not supported by this browser");
  const parser = createEventStreamParser(onEvent);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  while (true) {
    const { value, done } = await reader.read();
    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
    if (chunk) parser.push(chunk);
    if (done) break;
  }
  parser.finish();
}

function translateKaelEvent(
  currentRunId: string,
  event: PlatformAiStreamEvent,
  emit: (event: PlatformAiStreamEvent) => void,
  state: { messageStarted: boolean; terminal: boolean; cursor: number }
) {
  const delivery = event.data && typeof event.data === "object" ? event.data : {};
  const payload = delivery.payload && typeof delivery.payload === "object" ? delivery.payload : {};
  const runId = String(delivery.run_id || payload.run_id || "");
  const type = String(delivery.type || event.event);
  const sequence = Number(delivery.seq);
  if (Number.isSafeInteger(sequence)) state.cursor = sequence;
  if (runId && runId !== currentRunId) return;
  const messageId = String(delivery.message_id || payload.message_id || "");
  const startMessage = () => {
    if (state.messageStarted) return;
    state.messageStarted = true;
    emit({ event: "message_start", data: { message_id: messageId } });
  };
  if (type === "message.delta") {
    startMessage();
    emit({ event: "message_delta", data: { message_id: messageId, content: String(payload.delta || "") } });
  }
  if (type === "model.requested") {
    emit({ event: "agent_progress", data: { content: "Thinking", ...payload } });
  }
  if (type === "tool.call") emit({ event: "api_call_start", data: payload });
  if (["tool.completed", "tool.failed", "tool.cancelled"].includes(type)) {
    emit({ event: "api_call_result", data: { ...payload, ok: type === "tool.completed" } });
  }
  if (type === "approval.required") {
    emit({
      event: "approval_required",
      data: {
        ...payload,
        approval_id: delivery.approval_id || payload.approval_id,
        run_id: runId,
        risk_level: payload.risk
      }
    });
  }
  if (type === "message.completed") {
    startMessage();
    emit({ event: "message_done", data: { ...payload, message_id: messageId, status: payload.status || "completed" } });
  }
  if (["run.completed", "run.failed", "run.cancelled"].includes(type)) {
    state.terminal = true;
    if (type !== "run.completed") {
      emit({
        event: "message_error",
        data: { message_id: messageId, code: payload.error_code || type, detail: payload.reason || type }
      });
    }
  }
}

export async function streamPlatformAiMessage(
  conversationId: string,
  content: string,
  options: { signal?: AbortSignal; onEvent: (event: PlatformAiStreamEvent) => void }
) {
  const binding = await ensurePanel(conversationId);
  const conversation = await platformAiRequest<PlatformAiConversation>({
    method: "GET",
    path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(conversationId)}`
  });
  const capabilityMode = conversation.profile && conversation.profile !== "general" ? "service" : "disabled";
  const messageKey =
    globalThis.crypto?.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const message = await platformAiRequest<{ id: string }>({
    method: "POST",
    path: `${KAEL_API_ROOT}/conversations/${encodeURIComponent(conversationId)}/messages`,
    body: { role: "user", content, idempotency_key: messageKey }
  });
  const run = await platformAiRequest<KaelRun>({
    method: "POST",
    path: `${KAEL_API_ROOT}/runs`,
    body: {
      conversation_id: conversationId,
      input_message_id: message.id,
      panel_session_id: binding.panelId,
      execution_mode: "foreground",
      capability_mode: capabilityMode,
      idempotency_key: `run:${messageKey}`
    }
  });
  binding.activeRunId = run.id;
  const local = new AbortController();
  const abort = () => local.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const state = { messageStarted: false, terminal: false, cursor: binding.cursor };
  try {
    let disconnectedAt: number | null = null;
    let attempts = 0;
    let resetExpiredCursor = false;
    const onRawEvent = (event: PlatformAiStreamEvent) => {
      translateKaelEvent(run.id, event, options.onEvent, state);
      binding.cursor = state.cursor;
      disconnectedAt = null;
      attempts = 0;
      if (state.terminal) local.abort();
    };
    while (!state.terminal && !local.signal.aborted) {
      const request: ApiRequest = {
        method: "GET",
        path: `${KAEL_API_ROOT}/panel-sessions/${encodeURIComponent(binding.panelId)}/events`,
        service: "kael",
        query: { after: state.cursor },
        headers: { "Last-Event-ID": String(state.cursor) }
      };
      try {
        await (isDesktopRuntime()
          ? streamInDesktop(request, local.signal, onRawEvent)
          : streamInBrowser(request, local.signal, onRawEvent));
        if (!state.terminal) throw new PlatformAiRequestError("Kael event stream closed before the run completed");
      } catch (error) {
        if (state.terminal && error instanceof Error && error.name === "AbortError") break;
        if (local.signal.aborted) throw error;
        if (
          !resetExpiredCursor &&
          error instanceof PlatformAiRequestError &&
          error.status === 410 &&
          error.code === "cursor_expired"
        ) {
          state.cursor = 0;
          resetExpiredCursor = true;
          continue;
        }
        if (disconnectedAt === null) disconnectedAt = Date.now();
        if (Date.now() - disconnectedAt >= 60_000) throw error;
        await waitForRetry(Math.min(5000, 250 * 2 ** Math.min(attempts, 5)), local.signal);
        attempts += 1;
      }
    }
    if (!state.terminal) throw new PlatformAiRequestError("Kael event stream closed before the run completed");
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (binding.activeRunId === run.id && state.terminal) binding.activeRunId = "";
  }
}

export function toPlatformAiError(error: unknown) {
  if (error instanceof PlatformAiRequestError) return error;
  if (error instanceof ApiRequestError) {
    return new PlatformAiRequestError(error.message, error.status, error.data?.code || "");
  }
  return new PlatformAiRequestError(error instanceof Error ? error.message : String(error || ""));
}
