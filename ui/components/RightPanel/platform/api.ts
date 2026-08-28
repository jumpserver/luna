import type { ApiRequest } from "~/composables/useApiRequest";
import { ApiRequestError, apiRequest } from "~/composables/useApiRequest";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { getWebApiMutationHeaders, withWebSitePrefix } from "~/utils/runtime";
import { createEventStreamParser } from "./sse";
import type { PlatformAiStreamEvent } from "./sse";

export type { PlatformAiStreamEvent } from "./sse";

const CHAT_AI_BASE = "/api/v1/chat-ai";
const PAGE_SIZE = 100;

function platformAiRequest<T>(request: Omit<ApiRequest, "service">) {
  return apiRequest<T>({ ...request, service: "chat-ai" });
}

export interface PlatformAiAssistant {
  key: string;
  name: string;
  description?: string;
  starter_prompts?: string[];
}

export interface PlatformAiConversation {
  id: string;
  title?: string;
  assistant?: string;
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
}

interface DesktopApiStreamEvent {
  streamId: string;
  type: "chunk" | "done" | "error";
  chunk?: string;
  error?: string;
}

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

export function listPlatformAiConversations() {
  return platformAiRequest<PlatformAiConversation[] | Page<PlatformAiConversation>>({
    method: "GET",
    path: `${CHAT_AI_BASE}/conversations/`,
    query: { limit: PAGE_SIZE, ordering: "-date_updated" }
  });
}

export function createPlatformAiConversation(assistant: string) {
  return platformAiRequest<PlatformAiConversation>({
    method: "POST",
    path: `${CHAT_AI_BASE}/conversations/`,
    body: { assistant }
  });
}

export function updatePlatformAiConversation(id: string, body: { assistant?: string; title?: string }) {
  return platformAiRequest<PlatformAiConversation>({
    method: "PATCH",
    path: `${CHAT_AI_BASE}/conversations/${id}/`,
    body
  });
}

export function deletePlatformAiConversation(id: string) {
  return platformAiRequest<void>({ method: "DELETE", path: `${CHAT_AI_BASE}/conversations/${id}/` });
}

export function listPlatformAiAssistants() {
  return platformAiRequest<PlatformAiAssistant[] | Page<PlatformAiAssistant>>({
    method: "GET",
    path: `${CHAT_AI_BASE}/assistants/`
  });
}

function apiPath(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  const url = new URL(value);
  return `${url.pathname}${url.search}`;
}

export async function listPlatformAiMessages(id: string) {
  let next = `${CHAT_AI_BASE}/conversations/${id}/messages/?limit=${PAGE_SIZE}`;
  const messages: PlatformAiMessage[] = [];
  while (next) {
    const response = await platformAiRequest<PlatformAiMessage[] | Page<PlatformAiMessage>>({
      method: "GET",
      path: apiPath(next)
    });
    messages.push(...serverResults(response));
    next = Array.isArray(response) ? "" : response.next || "";
  }
  return messages;
}

export function cancelPlatformAiConversation(id: string) {
  return platformAiRequest<void>({ method: "POST", path: `${CHAT_AI_BASE}/conversations/${id}/cancel/` });
}

export function getPlatformAiApproval(id: string) {
  return platformAiRequest<PlatformAiApproval>({ method: "GET", path: `${CHAT_AI_BASE}/approvals/${id}/` });
}

export function confirmPlatformAiApproval(id: string) {
  return platformAiRequest<void>({ method: "POST", path: `${CHAT_AI_BASE}/approvals/${id}/confirm/` });
}

export function rejectPlatformAiApproval(id: string) {
  return platformAiRequest<void>({ method: "POST", path: `${CHAT_AI_BASE}/approvals/${id}/cancel/` });
}

function abortError() {
  const error = new Error("The request was aborted");
  error.name = "AbortError";
  return error;
}

function parseStreamError(message: string) {
  const match = message.match(/api stream request failed: status=(\d+), body=([\s\S]*)/);
  if (!match) return new PlatformAiRequestError(message);
  let body: any = match[2];
  try {
    body = JSON.parse(body);
  } catch {
    // Keep plain-text Core errors readable.
  }
  return new PlatformAiRequestError(body?.detail || body?.code || String(body), Number(match[1]), body?.code || "");
}

async function streamInDesktop(
  request: ApiRequest,
  signal: AbortSignal | undefined,
  onEvent: (event: PlatformAiStreamEvent) => void
) {
  const streamId = globalThis.crypto?.randomUUID?.() || `chat-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    if (payload.type === "error") settle(parseStreamError(payload.error || "Platform AI stream failed"));
  });
  const onAbort = () => {
    void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
    settle(abortError());
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal?.aborted) throw abortError();
    await desktopInvoke("api_stream_start", { streamId, request });
    await completion;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unlisten();
    if (!settled) void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
  }
}

async function responseError(response: Response) {
  const text = await response.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Keep non-JSON errors readable.
  }
  throw new PlatformAiRequestError(
    data?.detail || data?.code || text || `Platform AI request failed with HTTP ${response.status}`,
    response.status,
    data?.code || ""
  );
}

async function streamInBrowser(
  request: ApiRequest,
  signal: AbortSignal | undefined,
  onEvent: (event: PlatformAiStreamEvent) => void
) {
  const response = await fetch(withWebSitePrefix(request.path), {
    method: request.method,
    credentials: "include",
    headers: {
      ...getWebApiMutationHeaders(request.orgId),
      Accept: "text/event-stream",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request.body),
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

export function streamPlatformAiMessage(
  conversationId: string,
  content: string,
  options: { signal?: AbortSignal; onEvent: (event: PlatformAiStreamEvent) => void }
) {
  const request: ApiRequest = {
    method: "POST",
    path: `${CHAT_AI_BASE}/conversations/${conversationId}/messages/stream/`,
    service: "chat-ai",
    body: { content, web_search: false }
  };
  return isDesktopRuntime()
    ? streamInDesktop(request, options.signal, options.onEvent)
    : streamInBrowser(request, options.signal, options.onEvent);
}

export function toPlatformAiError(error: unknown) {
  if (error instanceof PlatformAiRequestError) return error;
  if (error instanceof ApiRequestError) {
    return new PlatformAiRequestError(error.message, error.status, error.data?.code || "");
  }
  return new PlatformAiRequestError(error instanceof Error ? error.message : String(error || ""));
}
