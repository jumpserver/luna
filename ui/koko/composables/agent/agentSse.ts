import type { DesktopUnlistenFn } from "~/shared/desktop/bridge";
import type { AgentEvent, AgentEventType } from "./types";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { getWebApiHeaders, isDesktopRuntime, withWebSitePrefix } from "~/utils/runtime";
import { AGENT_SESSIONS_ROOT, isRecord } from "./types";

const DEFAULT_MAX_BUFFER_BYTES = 384 * 1024;
const DEFAULT_MAX_EVENT_BYTES = 320 * 1024;
const DEFAULT_RECONNECT_WINDOW_MS = 60_000;
const EVENT_TYPES = new Set<AgentEventType>([
  "session.created",
  "session.closed",
  "session.approval_mode_changed",
  "message.created",
  "message.delta",
  "message.completed",
  "run.queued",
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "run.interrupted",
  "model.requested",
  "model.completed",
  "approval.requested",
  "approval.resolved",
  "tool.call",
  "tool.cancel",
  "tool.result",
  "error",
  "heartbeat",
  "stream.reset"
]);

const KAEL_EVENT_TYPES: Record<string, AgentEventType> = {
  "panel.ready": "session.created",
  "panel.resumed": "session.created",
  "panel.lease_expiring": "session.closed",
  "registration.updated": "session.created",
  "registration.revoked": "session.created",
  "approval.required": "approval.requested",
  "tool.progress": "tool.result",
  "tool.completed": "tool.result",
  "tool.failed": "tool.result",
  "tool.cancelled": "tool.result"
};

export function normalizeAgentEvent(value: Record<string, unknown>, eventName = "", eventId = ""): AgentEvent | null {
  const rawType = String(value.type || eventName);
  const type = (KAEL_EVENT_TYPES[rawType] || rawType) as AgentEventType;
  const seq = Number(value.seq ?? eventId);
  if (!EVENT_TYPES.has(type) || !Number.isSafeInteger(seq) || seq < 0) return null;
  const sourcePayload = isRecord(value.payload) ? value.payload : {};
  const payload: Record<string, unknown> = { ...sourcePayload };
  if (rawType === "registration.updated") {
    payload.tools = Array.isArray(sourcePayload.registrations) ? sourcePayload.registrations : [];
    payload.enabled = true;
  }
  if (rawType === "approval.required" && typeof sourcePayload.arguments_digest === "string") {
    payload.digest = sourcePayload.arguments_digest;
  }
  if (rawType === "panel.lease_expiring" && sourcePayload.state !== "closed") return null;
  const timestamp = Date.parse(String(value.timestamp || ""));
  return {
    seq,
    type,
    ...(typeof value.event_id === "string" ? { event_id: value.event_id } : {}),
    ...(typeof value.panel_session_id === "string" ? { session_id: value.panel_session_id } : {}),
    ...(typeof value.conversation_id === "string" ? { conversation_id: value.conversation_id } : {}),
    ...(typeof value.run_id === "string" ? { run_id: value.run_id } : {}),
    ...(typeof value.message_id === "string" ? { message_id: value.message_id } : {}),
    ...(typeof value.approval_id === "string" ? { approval_id: value.approval_id } : {}),
    ...(typeof value.tool_call_id === "string" ? { tool_call_id: value.tool_call_id } : {}),
    ...(Number.isFinite(timestamp) ? { timestamp } : {}),
    payload
  };
}

export interface AgentSseParser {
  push(chunk: string): void;
  finish(): void;
}

export function createAgentSseParser(
  onEvent: (event: AgentEvent) => void,
  limits: { maxBufferBytes?: number; maxEventBytes?: number } = {}
): AgentSseParser {
  const maxBufferBytes = limits.maxBufferBytes || DEFAULT_MAX_BUFFER_BYTES;
  const maxEventBytes = limits.maxEventBytes || DEFAULT_MAX_EVENT_BYTES;
  let buffer = "";
  let eventName = "";
  let eventId = "";
  let dataLines: string[] = [];

  function resetEvent() {
    eventName = "";
    eventId = "";
    dataLines = [];
  }

  function dispatch() {
    if (!dataLines.length) {
      resetEvent();
      return;
    }
    const data = dataLines.join("\n");
    if (data.length > maxEventBytes) throw new Error("Agent SSE event exceeds the configured limit");
    const parsed: unknown = JSON.parse(data);
    if (!isRecord(parsed)) throw new Error("Agent SSE event must be a JSON object");
    const event = normalizeAgentEvent(parsed, eventName, eventId);
    if (!event) {
      throw new Error("Agent SSE event has an invalid type or sequence");
    }
    onEvent(event);
    resetEvent();
  }

  function consumeLine(rawLine: string) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line) {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    if (field === "id") eventId = value;
    if (field === "data") dataLines.push(value);
  }

  return {
    push(chunk) {
      buffer += chunk;
      if (buffer.length > maxBufferBytes) throw new Error("Agent SSE buffer exceeds the configured limit");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    },
    finish() {
      if (buffer) consumeLine(buffer);
      buffer = "";
      dispatch();
    }
  };
}

interface OpenAgentStreamOptions {
  sessionId: string;
  resourceSessionId: string;
  after: number;
  signal: AbortSignal;
  onOpen: () => void;
  onChunk: (chunk: string) => void;
}

export type AgentStreamOpener = (options: OpenAgentStreamOptions) => Promise<void>;

export class AgentStreamHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody = ""
  ) {
    super(`Agent event stream failed with HTTP ${status}${responseBody ? `: ${responseBody}` : ""}`);
    this.name = "AgentStreamHttpError";
  }
}

function eventPath(sessionId: string) {
  const normalized = sessionId.trim();
  if (!normalized) throw new Error("Agent session id is required");
  return `${AGENT_SESSIONS_ROOT}${encodeURIComponent(normalized)}/events`;
}

async function openBrowserStream(options: OpenAgentStreamOptions) {
  const query = new URLSearchParams({ after: String(options.after) });
  const response = await fetch(`${withWebSitePrefix(eventPath(options.sessionId))}?${query}`, {
    method: "GET",
    credentials: "include",
    headers: {
      ...getWebApiHeaders(),
      Accept: "text/event-stream",
      "Last-Event-ID": String(options.after)
    },
    signal: options.signal
  });
  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new AgentStreamHttpError(response.status, responseBody);
  }
  if (!response.body) throw new Error("Agent event stream response body is unavailable");
  options.onOpen();

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  while (true) {
    const { value, done } = await reader.read();
    const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
    if (chunk) options.onChunk(chunk);
    if (done) break;
  }
}

interface DesktopApiStreamEvent {
  streamId: string;
  type: "chunk" | "done" | "error";
  chunk?: string;
  error?: string;
}

async function openDesktopStream(options: OpenAgentStreamOptions) {
  const streamId = globalThis.crypto?.randomUUID?.() || `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let settle!: () => void;
  let reject!: (error: Error) => void;
  let unlisten: DesktopUnlistenFn | null = null;
  const completion = new Promise<void>((resolve, rejectPromise) => {
    settle = resolve;
    reject = rejectPromise;
  });
  const onAbort = () => {
    void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
    const error = new Error("Agent event stream was aborted");
    error.name = "AbortError";
    reject(error);
  };

  try {
    unlisten = await desktopListen<DesktopApiStreamEvent>("api-stream", ({ payload }) => {
      if (payload.streamId !== streamId) return;
      if (payload.type === "chunk") options.onChunk(payload.chunk || "");
      if (payload.type === "done") settle();
      if (payload.type === "error") reject(new Error(payload.error || "Agent event stream failed"));
    });
    options.signal.addEventListener("abort", onAbort, { once: true });
    if (options.signal.aborted) return onAbort();
    const request = {
      method: "GET",
      path: eventPath(options.sessionId),
      service: "kael",
      query: { after: options.after },
      headers: {
        "Last-Event-ID": String(options.after)
      }
    };
    await desktopInvoke("api_stream_start", { streamId, request });
    options.onOpen();
    await completion;
  } finally {
    options.signal.removeEventListener("abort", onAbort);
    unlisten?.();
    void desktopInvoke("api_stream_cancel", { streamId }).catch(() => undefined);
  }
}

export const openAgentStream: AgentStreamOpener = (options) =>
  isDesktopRuntime() ? openDesktopStream(options) : openBrowserStream(options);

export type AgentSseState = "connecting" | "connected" | "reconnecting" | "unavailable" | "closed";

export interface AgentSseOptions {
  sessionId: string;
  resourceSessionId: string;
  after?: number;
  reconnectWindowMs?: number;
  opener?: AgentStreamOpener;
  onEvent: (event: AgentEvent) => void;
  onCursorExpired?: (after: number) => Promise<number>;
  onState?: (state: AgentSseState) => void;
  onUnavailable?: (error: Error) => void;
  now?: () => number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

function isCursorExpiredError(error: Error) {
  const status =
    error instanceof AgentStreamHttpError
      ? error.status
      : Number(error.message.match(/(?:HTTP\s+|status=)(\d{3})/i)?.[1] || 0);
  const detail = error instanceof AgentStreamHttpError ? error.responseBody : error.message;
  return status === 410 && detail.includes("cursor_expired");
}

function waitFor(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        const error = new Error("Agent reconnect wait was aborted");
        error.name = "AbortError";
        reject(error);
      },
      { once: true }
    );
  });
}

export class AgentSseConnection {
  private readonly opener: AgentStreamOpener;
  private readonly reconnectWindowMs: number;
  private readonly now: () => number;
  private readonly wait: (delayMs: number, signal: AbortSignal) => Promise<void>;
  private controller: AbortController | null = null;
  private runPromise: Promise<void> | null = null;
  private cursor: number;

  constructor(private readonly options: AgentSseOptions) {
    this.opener = options.opener || openAgentStream;
    this.reconnectWindowMs = options.reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS;
    this.now = options.now || Date.now;
    this.wait = options.wait || waitFor;
    this.cursor = Math.max(0, Math.floor(options.after || 0));
  }

  get after() {
    return this.cursor;
  }

  start() {
    if (this.runPromise) return this.runPromise;
    this.controller = new AbortController();
    this.runPromise = this.run(this.controller.signal).finally(() => {
      this.runPromise = null;
    });
    return this.runPromise;
  }

  stop() {
    this.controller?.abort();
    this.controller = null;
    this.options.onState?.("closed");
  }

  private async run(signal: AbortSignal) {
    let disconnectedAt: number | null = null;
    let attempts = 0;
    let recoveryWithoutProgressAt: number | null = null;
    this.options.onState?.("connecting");

    while (!signal.aborted) {
      const parser = createAgentSseParser((event) => {
        if (event.seq <= this.cursor) return;
        disconnectedAt = null;
        attempts = 0;
        recoveryWithoutProgressAt = null;
        this.options.onEvent(event);
        this.cursor = event.seq;
      });
      try {
        await this.opener({
          sessionId: this.options.sessionId,
          resourceSessionId: this.options.resourceSessionId,
          after: this.cursor,
          signal,
          onOpen: () => {
            this.options.onState?.("connected");
          },
          onChunk: (chunk) => {
            disconnectedAt = null;
            attempts = 0;
            parser.push(chunk);
          }
        });
        parser.finish();
        if (signal.aborted) return;
        throw new Error("Agent event stream closed unexpectedly");
      } catch (cause) {
        if (signal.aborted) return;
        const error = cause instanceof Error ? cause : new Error(String(cause || "Agent event stream failed"));
        if (isCursorExpiredError(error) && this.options.onCursorExpired) {
          try {
            const previous = this.cursor;
            const recovered = Math.floor(await this.options.onCursorExpired(previous));
            if (!Number.isSafeInteger(recovered) || recovered < previous) {
              throw new Error("Agent history recovery returned an invalid cursor");
            }
            if (recovered === previous && recoveryWithoutProgressAt === previous) {
              throw new Error("Agent history recovery did not advance the expired cursor");
            }
            recoveryWithoutProgressAt = recovered === previous ? previous : null;
            this.cursor = recovered;
            disconnectedAt = null;
            attempts = 0;
            this.options.onState?.("reconnecting");
            continue;
          } catch (recoveryCause) {
            const recoveryError =
              recoveryCause instanceof Error
                ? recoveryCause
                : new Error(String(recoveryCause || "Agent history recovery failed"));
            this.options.onState?.("unavailable");
            this.options.onUnavailable?.(recoveryError);
            return;
          }
        }
        if (disconnectedAt === null) disconnectedAt = this.now();
        if (this.now() - disconnectedAt >= this.reconnectWindowMs) {
          this.options.onState?.("unavailable");
          this.options.onUnavailable?.(error);
          return;
        }
        this.options.onState?.("reconnecting");
        const delayMs = Math.min(5000, 250 * 2 ** Math.min(attempts, 5));
        attempts += 1;
        try {
          await this.wait(delayMs, signal);
        } catch {
          return;
        }
      }
    }
  }
}
