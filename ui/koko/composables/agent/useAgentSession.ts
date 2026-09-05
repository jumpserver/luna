import type { UIMessage } from "ai";
import type { AgentClient } from "./agentClient";
import type { AgentSseConnection } from "./agentSse";
import type { AgentToolRelay, AgentToolRelayResult } from "./agentToolRelay";
import type {
  AgentApprovalDecision,
  AgentApprovalMode,
  AgentDomain,
  AgentEvent,
  AgentMcpManifest,
  AgentMessageRequest
} from "./types";
import { reactive } from "vue";
import { agentChatStreamMessage, agentEventLifecycle } from "./agentChatStream";
import { agentClient, AgentHttpError } from "./agentClient";
import { AgentSseConnection as DefaultAgentSseConnection } from "./agentSse";
import { isRecord } from "./types";

export interface AgentSessionState {
  status: "idle" | "creating" | "connecting" | "connected" | "reconnecting" | "unavailable" | "closed";
  agentSessionId: string;
  resourceSessionId: string;
  activeRunId: string;
  revision: number;
  lastSeq: number;
  available: boolean;
  approvalMode: AgentApprovalMode;
  toolNames: string[];
  registrationIds: Record<string, string>;
  errorCode: string;
  errorText: string;
}

interface AgentSessionOptions {
  domain: AgentDomain;
  allowedApprovalModes?: readonly AgentApprovalMode[];
  relay: AgentToolRelay;
  messageMetadata: () => Record<string, unknown>;
  onMessage: (message: UIMessage) => void;
  onAvailability: (available: boolean) => void;
  onApprovalMode?: (mode: AgentApprovalMode) => void;
  onInputLock?: (locked: boolean) => void;
  onHistoryReset?: () => void;
  onUnavailable?: (error: Error) => void;
  client?: AgentClient;
  createSse?: (options: ConstructorParameters<typeof DefaultAgentSseConnection>[0]) => AgentSseConnection;
  toolResultRetry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    wait?: (delayMs: number) => Promise<void>;
  };
  historyRecovery?: {
    maxEvents?: number;
    maxBytes?: number;
  };
}

class AgentSessionManifestMismatchError extends Error {}
class AgentSessionHistoryLimitError extends Error {}

interface ToolRelaySessionSnapshot {
  generation: number;
  sessionId: string;
  resourceSessionId: string;
  runId: string;
}

const DEFAULT_HISTORY_MAX_EVENTS = 131_072;
const DEFAULT_HISTORY_MAX_BYTES = 64 * 1024 * 1024;
const MESSAGE_TRACKING_LIMIT = 2_048;
const historyTextEncoder = new TextEncoder();

export interface AgentSessionController {
  state: AgentSessionState;
  actions: {
    attachManifest: (manifest: AgentMcpManifest) => Promise<void>;
    updateContext: (context: Record<string, unknown>) => Promise<void>;
    sendMessage: (message: UIMessage) => Promise<void>;
    resolveApproval: (approvalId: string, decision: AgentApprovalDecision) => Promise<void>;
    receiveKokoFrame: (frame: unknown) => Promise<boolean>;
    cancel: () => Promise<void>;
    setApprovalMode: (mode: AgentApprovalMode) => Promise<void>;
    dispose: () => Promise<void>;
  };
}

function eventMessageId(event: AgentEvent) {
  const role = String(event.payload?.role || "assistant");
  return event.message_id ? `agent-${role}-${event.message_id}-${event.seq}` : `${event.type}-${event.seq}`;
}

function isUiMessage(value: unknown): value is UIMessage {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if (value.role !== "user" && value.role !== "assistant" && value.role !== "system") return false;
  return Array.isArray(value.parts);
}

function agentMessageId(value: string) {
  const normalized = value.trim();
  if (normalized === value && normalized.length > 0 && normalized.length <= 128 && !normalized.includes("\u0000")) {
    return normalized;
  }
  return globalThis.crypto?.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sensitiveMetadataKey = /auth|cookie|token|password|secret|certificate|private[_-]?key|ticket/i;

function jsonMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized = jsonMetadataValue(item, depth + 1);
      return normalized === undefined ? [] : [normalized];
    });
  }
  if (!isRecord(value)) return undefined;
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveMetadataKey.test(key)) continue;
    const child = jsonMetadataValue(item, depth + 1);
    if (child !== undefined) normalized[key] = child;
  }
  return normalized;
}

function agentMessageMetadata(value: unknown) {
  if (!isRecord(value)) return undefined;
  const metadata: Record<string, unknown> = {};
  for (const key of ["domain", "targetId", "terminalId", "operation", "context", "execution_mode"] as const) {
    const normalized = jsonMetadataValue(value[key]);
    if (normalized !== undefined) metadata[key] = normalized;
  }
  return Object.keys(metadata).length ? metadata : undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function agentEventDeltaText(event: AgentEvent) {
  if (event.type !== "message.delta") return null;
  const delta = event.payload?.delta;
  const text = isRecord(delta) ? delta.text || delta.delta : delta || event.payload?.text;
  return typeof text === "string" ? text : null;
}

function agentEventStreamKey(event: AgentEvent) {
  const messageId = String(event.message_id || event.payload?.message_id || event.payload?.id || "");
  const runId = String(event.run_id || event.payload?.run_id || "");
  return messageId || runId ? `${messageId}\u0000${runId}` : "";
}

function canonicalHistoryEvents(history: AgentEvent[], after: number) {
  const bySequence = new Map<number, AgentEvent>();
  for (const event of history) {
    if (event.seq <= after) continue;
    const existing = bySequence.get(event.seq);
    if (existing && stableJson(existing) !== stableJson(event)) {
      throw new Error(`Agent history sequence ${event.seq} contains conflicting events`);
    }
    if (!existing) bySequence.set(event.seq, event);
  }

  const result: AgentEvent[] = [];
  for (const event of [...bySequence.values()].sort((left, right) => left.seq - right.seq)) {
    const text = agentEventDeltaText(event);
    const key = agentEventStreamKey(event);
    const previous = result.at(-1);
    const previousText = previous ? agentEventDeltaText(previous) : null;
    if (text !== null && key && previousText !== null && agentEventStreamKey(previous!) === key) {
      result[result.length - 1] = {
        ...event,
        payload: { ...event.payload, delta: previousText + text }
      };
      continue;
    }
    result.push(event);
  }
  return result;
}

function agentManifestKey(manifest: AgentMcpManifest) {
  return stableJson([
    manifest.profile,
    manifest.resourceSessionId,
    manifest.revision,
    manifest.context || {},
    manifest.tools
  ]);
}

function agentToolNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const rawName = typeof item === "string" ? item : isRecord(item) && typeof item.name === "string" ? item.name : "";
    const name = rawName.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function agentToolProgressCode(domain: AgentDomain, toolName: string) {
  if (domain === "terminal") {
    if (toolName === "execute_command" || toolName.startsWith("execute_")) return "executing";
    if (toolName === "database_schema") return "metadata_lookup";
    return "tool_running";
  }
  if (domain === "sql") {
    if (toolName === "inspect_schema") return "metadata_lookup";
    if (toolName === "propose_sql") return "proposing";
  }
  return ["save_text", "mkdir", "rename", "delete"].includes(toolName) ? "executing" : "tool_running";
}

function toAgentMessageRequest(message: UIMessage): AgentMessageRequest {
  if (message.role !== "user") throw new Error("Agent only accepts user messages");
  const parts = message.parts.flatMap((part) =>
    part.type === "text" && part.text ? [{ type: "text" as const, text: part.text }] : []
  );
  if (!parts.some((part) => part.text.trim())) throw new Error("Agent message text is required");
  const messageId = agentMessageId(message.id);
  const metadata = agentMessageMetadata(message.metadata);
  return {
    message_id: messageId,
    idempotency_key: messageId,
    role: "user",
    parts,
    ...(metadata ? { metadata } : {})
  };
}

function approvalPresentation(
  payload: Record<string, unknown>,
  domain: AgentDomain,
  approvalId: string,
  runId: string,
  toolCallId: string,
  resolved = false
) {
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  const argumentsValue = isRecord(payload.arguments) ? payload.arguments : {};
  const common = {
    ...payload,
    id: approvalId,
    approvalId,
    runId,
    toolCallId,
    planId: runId || `approval-${approvalId}`,
    stepId: toolCallId || approvalId,
    executionId: toolCallId || approvalId,
    tool: toolName,
    arguments: argumentsValue,
    rationale: typeof payload.summary === "string" ? payload.summary : "",
    ...(Number.isFinite(Number(payload.model_duration_ms))
      ? { decisionDurationMs: Number(payload.model_duration_ms) }
      : {}),
    ...(resolved
      ? {
          resolved: true,
          state:
            typeof payload.state === "string" && payload.state
              ? payload.state
              : typeof payload.status === "string" && payload.status
                ? payload.status
                : payload.approved === true
                  ? "approved"
                  : payload.approved === false
                    ? payload.reason === "run cancelled"
                      ? "cancelled"
                      : "rejected"
                    : "resolved"
        }
      : { state: "awaiting_approval" })
  };

  if (domain === "file") {
    return {
      type: "data-file-approval",
      data: {
        ...common,
        path: typeof argumentsValue.path === "string" ? argumentsValue.path : "",
        destinationPath: typeof argumentsValue.destination_path === "string" ? argumentsValue.destination_path : "",
        recursive: argumentsValue.recursive === true,
        expectedVersion: typeof argumentsValue.expected_version === "string" ? argumentsValue.expected_version : ""
      }
    };
  }

  if (toolName === "database_schema") {
    return {
      type: resolved ? "data-metadata-approval-resolved" : "data-metadata-approval",
      data: {
        ...common,
        query: typeof argumentsValue.query === "string" ? argumentsValue.query : "",
        tables: Array.isArray(argumentsValue.tables)
          ? argumentsValue.tables.filter((table): table is string => typeof table === "string")
          : []
      }
    };
  }

  let command = typeof argumentsValue.command === "string" ? argumentsValue.command : "";
  if (!command && toolName) {
    try {
      command = `${toolName} ${JSON.stringify(argumentsValue)}`;
    } catch {
      command = toolName;
    }
  }
  return {
    type: "data-approval",
    data: {
      ...common,
      command,
      execution: typeof argumentsValue.execution === "string" ? argumentsValue.execution : "auto",
      timeoutSeconds: typeof argumentsValue.timeout_seconds === "number" ? argumentsValue.timeout_seconds : undefined
    }
  };
}

function toolResultPresentation(event: AgentEvent) {
  const payload = event.payload || {};
  const result = isRecord(payload.result) ? payload.result : {};
  const structuredContent = isRecord(result.structuredContent) ? result.structuredContent : result;
  const error = isRecord(payload.error) ? payload.error : null;
  const status = String(payload.status || "");
  const done = payload.done !== false;
  const outcome = !done
    ? "running"
    : status === "timeout" || status === "unknown"
      ? status
      : ["cancelled", "interrupted"].includes(status)
        ? "interrupted"
        : error || result.isError === true || ["error", "failed"].includes(status)
          ? "error"
          : "success";
  const content = Array.isArray(result.content)
    ? result.content
        .flatMap((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []))
        .join("\n")
    : "";
  const exitCodeValue = structuredContent.exit_code ?? structuredContent.exitCode;

  return {
    type: "data-execution",
    data: {
      id: String(event.tool_call_id || payload.tool_call_id || ""),
      planId: String(event.run_id || payload.run_id || ""),
      stepId: String(event.tool_call_id || payload.tool_call_id || ""),
      executionId: String(event.tool_call_id || payload.tool_call_id || ""),
      outcome,
      status,
      done,
      ...(Number.isFinite(Number(payload.duration_ms)) ? { durationMs: Number(payload.duration_ms) } : {}),
      ...(Number.isFinite(Number(payload.model_duration_ms))
        ? { modelDurationMs: Number(payload.model_duration_ms) }
        : {}),
      ...(typeof exitCodeValue === "number" ? { exitCode: exitCodeValue } : {}),
      ...(typeof structuredContent.execution === "string" ? { execution: structuredContent.execution } : {}),
      ...(typeof structuredContent.output === "string"
        ? { output: structuredContent.output }
        : content
          ? { output: content }
          : {}),
      ...(typeof structuredContent.output_truncated === "boolean"
        ? { outputTruncated: structuredContent.output_truncated }
        : {}),
      ...(error && typeof error.message === "string" ? { summary: error.message } : {})
    }
  };
}

function sqlToolResultPresentations(event: AgentEvent) {
  const result = isRecord(event.payload?.result) ? event.payload.result : {};
  const structuredContent = isRecord(result.structuredContent) ? result.structuredContent : result;
  const kind = String(structuredContent.kind || "");
  const parts: Record<string, unknown>[] = [];
  const analysis =
    kind === "sql_context" && isRecord(structuredContent.context)
      ? structuredContent.context.currentSqlAnalysis
      : structuredContent.analysis;
  if (isRecord(analysis)) parts.push({ type: "data-sql-analysis", data: analysis });
  if (kind === "proposal" && isRecord(structuredContent.proposal)) {
    parts.push({ type: "data-sql-proposal", data: structuredContent.proposal });
  }
  return parts;
}

function agentToolLifecyclePresentation(event: AgentEvent, domain: AgentDomain, statusOverride = "") {
  const payload = event.payload || {};
  const toolCallId = String(event.tool_call_id || payload.tool_call_id || "");
  if (!toolCallId) return null;

  const result = isRecord(payload.result) ? payload.result : {};
  const hasResult = Object.hasOwn(payload, "result");
  const hasError = payload.error !== undefined && payload.error !== null;
  const statusValue = String(payload.status || "").toLowerCase();
  const status =
    statusOverride ||
    (event.type === "tool.call"
      ? "running"
      : payload.done === false || statusValue === "running"
        ? "running"
        : ["cancelled", "canceled", "interrupted"].includes(statusValue)
          ? "cancelled"
          : statusValue === "timeout" || statusValue === "unknown"
            ? statusValue
            : ["error", "failed"].includes(statusValue) || isRecord(payload.error) || result.isError === true
              ? "error"
              : "success");
  const toolName = String(payload.tool_name || payload.name || "");

  return {
    type: "data-agent-tool",
    data: {
      id: toolCallId,
      toolCallId,
      domain,
      ...(toolName ? { toolName } : {}),
      status,
      ...(Object.hasOwn(payload, "arguments") ? { arguments: payload.arguments } : {}),
      ...(hasResult ? { result: payload.result } : {}),
      ...(hasError ? { error: payload.error } : {}),
      ...(Number.isFinite(Number(payload.duration_ms)) ? { durationMs: Number(payload.duration_ms) } : {})
    }
  };
}

export function agentEventToUiMessage(
  event: AgentEvent,
  domain: AgentDomain,
  metadata: Record<string, unknown>
): UIMessage | null {
  const payload = event.payload || {};
  const eventMetadata = {
    ...metadata,
    agentEventType: event.type,
    agentRunId: String(event.run_id || payload.run_id || ""),
    ...(Number.isFinite(Number(payload.model_duration_ms))
      ? { modelDurationMs: Number(payload.model_duration_ms) }
      : {})
  };
  const embedded = payload.message ?? payload.ui_message;
  if (isUiMessage(embedded)) {
    return {
      ...embedded,
      id: eventMessageId(event),
      metadata: { ...(isRecord(embedded.metadata) ? embedded.metadata : {}), ...eventMetadata }
    };
  }
  if (event.type.startsWith("message.") && Array.isArray(payload.parts) && payload.parts.length) {
    return {
      id: eventMessageId(event),
      role: payload.role === "user" || payload.role === "system" ? payload.role : "assistant",
      metadata: eventMetadata,
      parts: payload.parts
    } as UIMessage;
  }
  const messageText =
    typeof payload.text === "string"
      ? payload.text
      : event.type === "message.completed" && typeof payload.content === "string"
        ? payload.content
        : null;
  if (event.type.startsWith("message.") && messageText !== null) {
    return {
      id: eventMessageId(event),
      role: payload.role === "user" || payload.role === "system" ? payload.role : "assistant",
      metadata: eventMetadata,
      parts: [{ type: "text", text: messageText }]
    } as UIMessage;
  }

  let part: Record<string, unknown> | null = null;
  const additionalParts: Record<string, unknown>[] = [];
  if (event.type === "session.created") {
    part = {
      type: "data-capability",
      data: { ...payload, tools: agentToolNames(payload.tools), enabled: payload.enabled !== false }
    };
  }
  if (event.type === "session.closed") part = { type: "data-capability", data: { ...payload, enabled: false } };
  if (event.type.startsWith("run.")) {
    const stateByType: Partial<Record<AgentEvent["type"], string>> = {
      "run.queued": "queued",
      "run.started": "running",
      "run.completed": "completed",
      "run.failed": "failed",
      "run.cancelled": "cancelled",
      "run.interrupted": "interrupted"
    };
    part = {
      type: "data-progress",
      data: { ...payload, code: payload.error_code || "", state: payload.state || stateByType[event.type] }
    };
  }
  if (event.type === "model.requested") {
    const code = Number(payload.round) > 1 || payload.phase ? "planning" : "analyzing";
    part = { type: "data-progress", data: { ...payload, code, state: code } };
  }
  if (event.type === "model.completed") {
    part = { type: "data-progress", data: { ...payload, code: "planning", state: "planning" } };
  }
  if (event.type === "run.cancelled" && ["approval_expired", "run_timeout"].includes(String(payload.error_code))) {
    additionalParts.push({ type: "data-agent-notice", data: { code: payload.error_code } });
  }
  if (event.type === "run.cancelled" && payload.cancel_reason === "tool_result_failed") {
    additionalParts.push({ type: "data-agent-notice", data: { code: "tool_result_failed" } });
  }
  if (event.type === "run.failed") {
    part = {
      type: "data-error",
      data: { ...payload, code: payload.error_code || "run_failed", message: payload.reason || "Agent run failed" }
    };
  }
  if (event.type === "approval.requested") {
    part = approvalPresentation(
      payload,
      domain,
      String(event.approval_id || payload.approval_id || payload.id || ""),
      String(event.run_id || payload.run_id || ""),
      String(event.tool_call_id || payload.tool_call_id || "")
    );
  }
  if (event.type === "approval.resolved") {
    part = approvalPresentation(
      payload,
      domain,
      String(event.approval_id || payload.approval_id || payload.id || ""),
      String(event.run_id || payload.run_id || ""),
      String(event.tool_call_id || payload.tool_call_id || ""),
      true
    );
  }
  if (event.type === "tool.call") {
    const toolCallId = String(event.tool_call_id || payload.tool_call_id || "");
    const toolName = String(payload.tool_name || payload.name || "");
    const code = agentToolProgressCode(domain, toolName);
    part = {
      type: "data-progress",
      data: {
        toolCallId,
        tool_name: toolName,
        code,
        state: code,
        ...(typeof payload.execution === "string" ? { execution: payload.execution } : {})
      }
    };
    const lifecycle = agentToolLifecyclePresentation(event, domain);
    if (lifecycle) additionalParts.push(lifecycle);
  }
  if (event.type === "tool.result" && domain === "terminal") part = toolResultPresentation(event);
  if (event.type === "tool.result") {
    const lifecycle = agentToolLifecyclePresentation(event, domain);
    if (lifecycle) additionalParts.push(lifecycle);
    if (domain === "sql") additionalParts.push(...sqlToolResultPresentations(event));
  }
  if (event.type === "tool.cancel") {
    const lifecycle = agentToolLifecyclePresentation(event, domain, "cancelled");
    if (lifecycle) additionalParts.push(lifecycle);
  }
  if (event.type === "message.delta") {
    const delta = isRecord(payload.delta) ? payload.delta.text || payload.delta.delta : payload.delta || payload.text;
    if (typeof delta === "string") part = { type: "text", text: delta };
  }
  if (event.type === "error") part = { type: "data-error", data: payload };
  if (!part && additionalParts.length === 0) return null;

  const parts: Record<string, unknown>[] = [];
  if (typeof payload.input_locked === "boolean") {
    parts.push({ type: "data-input-lock", data: { locked: payload.input_locked } });
  }
  if (part) parts.push(part);
  parts.push(...additionalParts);
  return {
    id: eventMessageId(event),
    role: "assistant",
    metadata: eventMetadata,
    parts
  } as UIMessage;
}

export function useAgentSession(options: AgentSessionOptions): AgentSessionController {
  const client = options.client || agentClient;
  const createSse = options.createSse || ((sseOptions) => new DefaultAgentSseConnection(sseOptions));
  const toolResultMaxAttempts = Math.max(1, Math.floor(options.toolResultRetry?.maxAttempts || 4));
  const toolResultBaseDelayMs = Math.max(1, Math.floor(options.toolResultRetry?.baseDelayMs || 250));
  const waitForToolResultRetry =
    options.toolResultRetry?.wait ||
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const historyMaxEvents = Math.max(1, Math.floor(options.historyRecovery?.maxEvents || DEFAULT_HISTORY_MAX_EVENTS));
  const historyMaxBytes = Math.max(1, Math.floor(options.historyRecovery?.maxBytes || DEFAULT_HISTORY_MAX_BYTES));
  const state = reactive<AgentSessionState>({
    status: "idle",
    agentSessionId: "",
    resourceSessionId: "",
    activeRunId: "",
    revision: 0,
    lastSeq: 0,
    available: false,
    approvalMode: "auto",
    toolNames: [],
    registrationIds: {},
    errorCode: "",
    errorText: ""
  });
  let generation = 0;
  let lifecycleTail = Promise.resolve();
  let attachFlight: { key: string; promise: Promise<void> } | null = null;
  let committedManifestKey = "";
  let sse: AgentSseConnection | null = null;
  let retainedResourceId = "";
  const pendingSessionDeletes: Array<{
    sessionId: string;
    resourceSessionId: string;
    promise: Promise<void>;
  }> = [];
  const pendingApprovals = new Map<
    string,
    {
      runId: string;
      digest: string;
      toolCallId: string;
      toolName: string;
      argumentsValue: Record<string, unknown>;
      summary: string;
    }
  >();
  const resolvedApprovals = new Map(pendingApprovals);
  const localUserMessageIds = new Map<string, true>();
  const presentedUserMessageIds = new Map<string, true>();
  const pendingModelDurationByRun = new Map<string, number>();
  const streamedAssistantMessageRuns = new Map<string, string>();

  function rememberRecentMessage<T>(messages: Map<string, T>, messageId: string, value: T) {
    if (!messageId) return;
    messages.delete(messageId);
    messages.set(messageId, value);
    while (messages.size > MESSAGE_TRACKING_LIMIT) {
      const oldest = messages.keys().next().value;
      if (typeof oldest !== "string") break;
      messages.delete(oldest);
    }
  }

  function resetHistoryPresentation() {
    localUserMessageIds.clear();
    presentedUserMessageIds.clear();
    streamedAssistantMessageRuns.clear();
    options.onHistoryReset?.();
  }

  function setAvailable(available: boolean) {
    state.available = available;
    options.onAvailability(available);
    if (!available) options.onInputLock?.(false);
  }

  function applyApprovalMode(value: unknown) {
    const mode = String(value || "");
    if (mode !== "always" && mode !== "auto" && mode !== "never") return;
    state.approvalMode = mode;
    options.onApprovalMode?.(mode);
  }

  function cancelAndResetRelay(reason: string) {
    options.relay.cancelPending(reason);
    options.relay.reset();
  }

  function queueSessionDelete(sessionId: string, resourceSessionId: string) {
    const existing = pendingSessionDeletes.find(
      (deletion) => deletion.sessionId === sessionId && deletion.resourceSessionId === resourceSessionId
    );
    if (existing) return existing.promise;
    const deletion = {
      sessionId,
      resourceSessionId,
      promise: client.deleteSession(sessionId, resourceSessionId)
    };
    pendingSessionDeletes.push(deletion);
    void deletion.promise.catch(() => undefined);
    return deletion.promise;
  }

  async function flushSessionDeletes() {
    while (pendingSessionDeletes.length) {
      const deletion = pendingSessionDeletes[0]!;
      try {
        await deletion.promise;
      } catch {
        deletion.promise = client.deleteSession(deletion.sessionId, deletion.resourceSessionId);
        void deletion.promise.catch(() => undefined);
        await deletion.promise;
      }
      if (pendingSessionDeletes[0] === deletion) pendingSessionDeletes.shift();
    }
  }

  function handleEvent(event: AgentEvent, currentGeneration: number) {
    if (generation !== currentGeneration) return;
    if (event.session_id && event.session_id !== state.agentSessionId) return;
    if (event.resource_session_id && event.resource_session_id !== state.resourceSessionId) return;
    state.lastSeq = event.seq;
    const payload = event.payload || {};
    const runId = String(event.run_id || payload.run_id || "");
    const lifecycle = agentEventLifecycle(event.type);
    const assistantStreamKey = agentEventStreamKey(event);
    if (agentEventDeltaText(event) !== null) {
      rememberRecentMessage(streamedAssistantMessageRuns, assistantStreamKey, runId);
    }
    const completedAfterDelta = lifecycle.messageCompleted && streamedAssistantMessageRuns.has(assistantStreamKey);
    if (lifecycle.messageCompleted && assistantStreamKey) streamedAssistantMessageRuns.delete(assistantStreamKey);
    if (event.type === "session.created") {
      applyApprovalMode(payload.approval_mode);
      if (Array.isArray(payload.tools)) state.toolNames = agentToolNames(payload.tools);
    }
    if (event.type === "run.started") state.activeRunId = event.run_id || "";
    if (lifecycle.runFinished) {
      for (const [approvalId, binding] of pendingApprovals) {
        if (binding.runId === runId)
          presentApprovalResolution(approvalId, payload.error_code === "approval_expired" ? "expired" : "cancelled");
      }
      state.activeRunId = "";
      if (runId) {
        pendingModelDurationByRun.delete(runId);
        for (const [messageId, messageRunId] of streamedAssistantMessageRuns) {
          if (messageRunId === runId) streamedAssistantMessageRuns.delete(messageId);
        }
      }
    }
    if (event.type === "approval.requested") {
      const approvalId = String(event.approval_id || payload.approval_id || "");
      if (approvalId) {
        pendingApprovals.set(approvalId, {
          runId: String(event.run_id || payload.run_id || ""),
          digest: String(payload.digest || ""),
          toolCallId: String(event.tool_call_id || payload.tool_call_id || ""),
          toolName: typeof payload.tool_name === "string" ? payload.tool_name : "",
          argumentsValue: isRecord(payload.arguments) ? payload.arguments : {},
          summary: typeof payload.summary === "string" ? payload.summary : ""
        });
      }
    }
    let presentationEvent = event;
    if (event.type === "model.completed" && runId) {
      const durationMS = Number(payload.duration_ms);
      if (Number.isFinite(durationMS) && durationMS >= 0) {
        pendingModelDurationByRun.set(runId, (pendingModelDurationByRun.get(runId) || 0) + durationMS);
      }
    }
    if (event.type === "message.created" && payload.role === "assistant" && runId) {
      const modelDurationMS = pendingModelDurationByRun.get(runId);
      if (modelDurationMS !== undefined) {
        presentationEvent = {
          ...event,
          payload: { ...payload, model_duration_ms: modelDurationMS }
        };
        pendingModelDurationByRun.delete(runId);
      }
    }
    if (event.type === "approval.resolved") {
      const approvalId = String(event.approval_id || payload.approval_id || "");
      const binding = pendingApprovals.get(approvalId) || resolvedApprovals.get(approvalId);
      if (binding) {
        presentationEvent = {
          ...event,
          run_id: event.run_id || binding.runId,
          tool_call_id: event.tool_call_id || binding.toolCallId,
          payload: {
            ...payload,
            tool_name: binding.toolName,
            arguments: binding.argumentsValue,
            summary: binding.summary
          }
        };
      }
      if (approvalId) {
        pendingApprovals.delete(approvalId);
        resolvedApprovals.delete(approvalId);
      }
    }
    if (event.type === "session.approval_mode_changed") {
      applyApprovalMode(payload.current || payload.mode || payload.approval_mode);
      return;
    }
    if (event.type === "tool.call" || event.type === "tool.cancel") {
      if (event.type === "tool.call" && runId) pendingModelDurationByRun.delete(runId);
      options.relay.forwardAgentEvent(event);
      if (event.type === "tool.call" || event.type === "tool.cancel") {
        const message = agentEventToUiMessage(event, options.domain, options.messageMetadata());
        if (message) options.onMessage(message);
      }
      return;
    }
    if (event.type === "heartbeat" || event.type === "stream.reset") return;
    if (event.type === "session.closed") {
      state.status = "closed";
      setAvailable(false);
    }
    const inputLocked = payload.input_locked;
    if (typeof inputLocked === "boolean") options.onInputLock?.(inputLocked);
    const userMessageId =
      event.type === "message.created" && payload.role === "user" ? String(event.message_id || "") : "";
    if (userMessageId && localUserMessageIds.has(userMessageId)) {
      localUserMessageIds.delete(userMessageId);
      rememberRecentMessage(presentedUserMessageIds, userMessageId, true);
      return;
    }
    if (userMessageId && presentedUserMessageIds.has(userMessageId)) return;
    const messageMetadata = {
      ...options.messageMetadata(),
      ...(lifecycle.messageCompleted ? { agentCompletedSnapshot: !completedAfterDelta } : {})
    };
    const projectedMessage = agentEventToUiMessage(presentationEvent, options.domain, messageMetadata);
    const message =
      projectedMessage && lifecycle.messageCompleted ? agentChatStreamMessage(projectedMessage) : projectedMessage;
    if (message) {
      options.onMessage(message);
      if (userMessageId) rememberRecentMessage(presentedUserMessageIds, userMessageId, true);
    }
  }

  async function restoreHistory(
    sessionId: string,
    resourceSessionId: string,
    currentGeneration: number,
    manifest: AgentMcpManifest,
    startAfter = 0
  ) {
    const historyEvents: AgentEvent[] = [];
    let after = startAfter;
    let historyBytes = 0;
    while (true) {
      const history = await client.history(sessionId, resourceSessionId, after);
      if (generation !== currentGeneration) return after;
      for (const event of history.events) {
        historyBytes += historyTextEncoder.encode(JSON.stringify(event)).byteLength + 1;
        if (historyEvents.length >= historyMaxEvents || historyBytes > historyMaxBytes) {
          throw new AgentSessionHistoryLimitError("Agent history exceeds the bounded recovery limit");
        }
        historyEvents.push(event);
      }
      const nextCursor = Math.max(0, Math.floor(Number(history.next_cursor) || 0));
      if (!history.has_more) {
        after = Math.max(after, nextCursor);
        break;
      }
      if (nextCursor <= after) throw new Error("Agent history cursor did not advance");
      after = nextCursor;
    }

    const events = canonicalHistoryEvents(historyEvents, startAfter);

    const created = events.find((event) => event.type === "session.created");
    if (startAfter === 0) {
      if (!created) {
        throw new AgentSessionManifestMismatchError("Existing Agent session history is missing session.created");
      }
      if (
        created.payload?.profile !== manifest.profile ||
        Number(created.payload?.revision) !== manifest.revision ||
        stableJson(created.payload?.context || {}) !== stableJson(manifest.context || {}) ||
        stableJson(created.payload?.tools) !== stableJson(manifest.tools)
      ) {
        throw new AgentSessionManifestMismatchError("Existing Agent session does not match the Koko manifest");
      }
      resetHistoryPresentation();
    }

    const eventRunId = (event: AgentEvent) => String(event.run_id || event.payload?.run_id || "");
    const eventToolCallId = (event: AgentEvent) => String(event.tool_call_id || event.payload?.tool_call_id || "");
    const terminalRuns = new Set(
      events.flatMap((event) =>
        agentEventLifecycle(event.type).runFinished && eventRunId(event) ? [eventRunId(event)] : []
      )
    );
    const completedToolCalls = new Set(
      events.flatMap((event) =>
        event.type === "tool.result" && eventToolCallId(event) ? [eventToolCallId(event)] : []
      )
    );
    const unsafeRelayEvent = events.find((event) => {
      if (event.type !== "tool.call" && event.type !== "tool.cancel") return false;
      const toolCallId = eventToolCallId(event);
      const runId = eventRunId(event);
      return !completedToolCalls.has(toolCallId) && !terminalRuns.has(runId);
    });
    const replayAfter = unsafeRelayEvent ? Math.max(0, unsafeRelayEvent.seq - 1) : after;

    for (const event of events) {
      if (event.seq > replayAfter) break;
      if (event.type === "tool.call" || event.type === "tool.cancel") {
        if (event.type === "tool.call") {
          const runId = String(event.run_id || event.payload?.run_id || "");
          if (runId) pendingModelDurationByRun.delete(runId);
        }
        state.lastSeq = Math.max(state.lastSeq, event.seq);
        continue;
      }
      handleEvent(event, currentGeneration);
    }
    return replayAfter;
  }

  async function performAttach(manifest: AgentMcpManifest, manifestKey: string, currentGeneration: number) {
    if (generation !== currentGeneration) return;
    const previousSessionId = state.agentSessionId;
    const previousResourceSessionId = state.resourceSessionId;
    const replacesSession = Boolean(
      previousSessionId &&
      (previousResourceSessionId !== manifest.resourceSessionId ||
        state.revision !== manifest.revision ||
        (committedManifestKey && committedManifestKey !== manifestKey))
    );
    let acquiredSessionId = "";
    let committed = false;
    sse?.stop();
    sse = null;
    cancelAndResetRelay("session_replaced");
    pendingApprovals.clear();
    resolvedApprovals.clear();
    pendingModelDurationByRun.clear();
    streamedAssistantMessageRuns.clear();
    state.status = "creating";
    state.agentSessionId = "";
    state.resourceSessionId = manifest.resourceSessionId;
    state.activeRunId = "";
    state.revision = manifest.revision;
    state.toolNames = agentToolNames(manifest.tools);
    state.registrationIds = {};
    state.errorCode = "";
    state.errorText = "";
    setAvailable(false);
    if (retainedResourceId !== manifest.resourceSessionId) {
      if (retainedResourceId) client.releaseResource(retainedResourceId);
      retainedResourceId = manifest.resourceSessionId;
      client.retainResource(retainedResourceId);
    }

    try {
      await flushSessionDeletes();
      if (generation !== currentGeneration) return;
      if (replacesSession) {
        queueSessionDelete(previousSessionId, previousResourceSessionId);
        await flushSessionDeletes();
        if (generation !== currentGeneration) return;
      }
      const bootstrap = await client.bootstrap(manifest.resourceSessionId, replacesSession);
      let agentSessionId = String(bootstrap.session_id || "");
      acquiredSessionId = agentSessionId;
      if (generation !== currentGeneration) return;
      let after = Math.max(0, Math.floor(Number(bootstrap.cursor) || 0));
      if (!agentSessionId) {
        resetHistoryPresentation();
        const created = await client.createSession(manifest, state.approvalMode);
        agentSessionId = String(created.session_id || "");
        acquiredSessionId = agentSessionId;
        if (generation !== currentGeneration) return;
        after = Math.max(0, Math.floor(Number(created.after) || 0));
        state.registrationIds = { ...(created.registration_ids || {}) };
      }
      if (!agentSessionId) throw new Error("Agent session creation did not return a session id");
      state.agentSessionId = agentSessionId;
      state.lastSeq = 0;
      if (bootstrap.session_id) {
        try {
          after = await restoreHistory(agentSessionId, manifest.resourceSessionId, currentGeneration, manifest, 0);
        } catch (error) {
          if (!(error instanceof AgentSessionManifestMismatchError)) throw error;
          queueSessionDelete(agentSessionId, manifest.resourceSessionId);
          acquiredSessionId = "";
          await flushSessionDeletes();
          if (generation !== currentGeneration) return;
          resetHistoryPresentation();
          const created = await client.createSession(manifest, state.approvalMode);
          agentSessionId = String(created.session_id || "");
          acquiredSessionId = agentSessionId;
          if (generation !== currentGeneration) return;
          after = Math.max(0, Math.floor(Number(created.after) || 0));
          state.registrationIds = { ...(created.registration_ids || {}) };
          state.agentSessionId = agentSessionId;
          state.lastSeq = 0;
        }
        if (generation !== currentGeneration) return;
      }
      state.lastSeq = Math.max(state.lastSeq, after);
      state.status = "connecting";
      setAvailable(true);
      options.onMessage({
        id: `agent-capability-${agentSessionId}`,
        role: "assistant",
        metadata: options.messageMetadata(),
        parts: [{ type: "data-capability", data: { enabled: true, tools: [...state.toolNames] } }]
      } as UIMessage);

      sse = createSse({
        sessionId: agentSessionId,
        resourceSessionId: manifest.resourceSessionId,
        after: state.lastSeq,
        onEvent: (event) => handleEvent(event, currentGeneration),
        onCursorExpired: async (expiredAfter) => {
          if (generation !== currentGeneration) throw new Error("Agent session changed during history recovery");
          return restoreHistory(agentSessionId, manifest.resourceSessionId, currentGeneration, manifest, expiredAfter);
        },
        onState: (connectionState) => {
          if (generation !== currentGeneration || connectionState === "closed") return;
          state.status = connectionState;
        },
        onUnavailable: (error) => {
          if (generation !== currentGeneration) return;
          cancelAndResetRelay("agent_unavailable");
          state.status = "unavailable";
          state.errorCode = "agent_unavailable";
          state.errorText = error.message;
          setAvailable(false);
          options.onUnavailable?.(error);
        }
      });
      void sse.start();
      committed = true;
      committedManifestKey = manifestKey;
    } catch (cause) {
      if (generation !== currentGeneration) return;
      const error = cause instanceof Error ? cause : new Error(String(cause || "Agent session creation failed"));
      state.status = "unavailable";
      state.errorCode = cause instanceof AgentSessionHistoryLimitError ? "history_limit" : "agent_unavailable";
      state.errorText = error.message;
      setAvailable(false);
      options.onUnavailable?.(error);
      throw error;
    } finally {
      if (!committed && generation !== currentGeneration && acquiredSessionId) {
        const deletion = queueSessionDelete(acquiredSessionId, manifest.resourceSessionId);
        await deletion.catch(() => undefined);
        if (state.agentSessionId === acquiredSessionId) state.agentSessionId = "";
      }
    }
  }

  async function attachManifest(manifest: AgentMcpManifest) {
    if (manifest.profile !== options.domain) throw new Error("Agent profile does not match the workspace domain");
    const key = agentManifestKey(manifest);
    if (attachFlight?.key === key) return attachFlight.promise;
    if (
      !attachFlight &&
      committedManifestKey === key &&
      state.agentSessionId &&
      state.resourceSessionId === manifest.resourceSessionId &&
      state.revision === manifest.revision &&
      state.status !== "unavailable" &&
      state.status !== "closed"
    ) {
      return;
    }

    const currentGeneration = ++generation;
    const promise = lifecycleTail.catch(() => undefined).then(() => performAttach(manifest, key, currentGeneration));
    lifecycleTail = promise.catch(() => undefined);
    attachFlight = { key, promise };
    void promise.then(
      () => {
        if (attachFlight?.promise === promise) attachFlight = null;
      },
      () => {
        if (attachFlight?.promise === promise) attachFlight = null;
      }
    );
    return promise;
  }

  async function sendMessage(message: UIMessage) {
    if (!state.available || !state.agentSessionId || !state.resourceSessionId) {
      throw new Error("Agent session is unavailable");
    }
    const request = toAgentMessageRequest(message);
    rememberRecentMessage(localUserMessageIds, request.message_id, true);
    try {
      await client.sendMessage(state.agentSessionId, state.resourceSessionId, request);
    } catch (error) {
      localUserMessageIds.delete(request.message_id);
      throw error;
    }
  }

  async function updateContext(context: Record<string, unknown>) {
    if (!state.available || !state.agentSessionId || !state.resourceSessionId) {
      throw new Error("Agent session is unavailable");
    }
    await client.updateContext(state.agentSessionId, state.resourceSessionId, context);
  }

  function presentApprovalResolution(approvalId: string, status: string) {
    const binding = pendingApprovals.get(approvalId);
    if (!binding) return;
    const part = approvalPresentation(
      {
        tool_name: binding.toolName,
        arguments: binding.argumentsValue,
        summary: binding.summary,
        state: status
      },
      options.domain,
      approvalId,
      binding.runId,
      binding.toolCallId,
      true
    );
    options.onMessage({
      id: `approval-${approvalId}-${status}`,
      role: "assistant",
      metadata: options.messageMetadata(),
      parts: [part]
    } as UIMessage);
    rememberRecentMessage(resolvedApprovals, approvalId, binding);
    pendingApprovals.delete(approvalId);
  }

  async function resolveApproval(approvalId: string, decision: AgentApprovalDecision) {
    if (!state.agentSessionId || !state.resourceSessionId) throw new Error("Agent session is unavailable");
    const binding = pendingApprovals.get(approvalId);
    try {
      await client.resolveApproval(state.agentSessionId, state.resourceSessionId, approvalId, {
        decision,
        ...(binding?.runId ? { run_id: binding.runId } : {}),
        ...(binding?.digest ? { digest: binding.digest } : {})
      });
    } catch (error) {
      if (!(error instanceof AgentHttpError) || error.status !== 409) throw error;
      if (error.code === "approval_expired") {
        presentApprovalResolution(approvalId, "expired");
        return;
      }
      if (error.code !== "approval_terminal") throw error;
      const approval = await client.getApproval(approvalId);
      if (!["approved", "consumed", "rejected", "expired", "cancelled"].includes(approval.state)) throw error;
      presentApprovalResolution(approvalId, approval.state === "consumed" ? "approved" : approval.state);
    }
  }

  function relaySessionSnapshot(): ToolRelaySessionSnapshot {
    return {
      generation,
      sessionId: state.agentSessionId,
      resourceSessionId: state.resourceSessionId,
      runId: state.activeRunId
    };
  }

  function isCurrentRelaySession(snapshot: ToolRelaySessionSnapshot) {
    return (
      generation === snapshot.generation &&
      state.agentSessionId === snapshot.sessionId &&
      state.resourceSessionId === snapshot.resourceSessionId
    );
  }

  function discardRelayResult(result: AgentToolRelayResult) {
    try {
      result.complete(false);
    } catch {
      // A reset relay may already have discarded the old delivery.
    }
  }

  async function failToolRelay(cause: unknown, snapshot: ToolRelaySessionSnapshot) {
    const failure = cause instanceof Error ? cause : new Error(String(cause || "Agent tool relay failed"));
    if (!isCurrentRelaySession(snapshot)) return null;
    cancelAndResetRelay("tool_result_failed");
    if (!isCurrentRelaySession(snapshot)) return null;
    pendingApprovals.clear();
    resolvedApprovals.clear();
    pendingModelDurationByRun.clear();
    streamedAssistantMessageRuns.clear();
    const failedSse = sse;
    sse = null;
    failedSse?.stop();
    if (!isCurrentRelaySession(snapshot)) return null;
    state.activeRunId = "";
    state.status = "unavailable";
    state.errorCode = "tool_result_failed";
    state.errorText = failure.message;
    setAvailable(false);
    if (!isCurrentRelaySession(snapshot)) return null;
    options.onUnavailable?.(failure);
    if (snapshot.sessionId && snapshot.resourceSessionId && isCurrentRelaySession(snapshot)) {
      await client
        .cancel(snapshot.sessionId, snapshot.resourceSessionId, snapshot.runId, "tool_result_failed")
        .catch(() => undefined);
    }
    return isCurrentRelaySession(snapshot) ? failure : null;
  }

  async function receiveKokoFrame(frame: unknown) {
    const snapshot = relaySessionSnapshot();
    if (!state.available || !snapshot.sessionId || !snapshot.resourceSessionId) return false;
    let result: AgentToolRelayResult | null;
    try {
      result = options.relay.consumeKokoFrame(frame);
    } catch (error) {
      if (!isCurrentRelaySession(snapshot)) return true;
      const failure = await failToolRelay(error, snapshot);
      if (failure) throw failure;
      return true;
    }
    if (!result) return false;
    if (!isCurrentRelaySession(snapshot)) {
      discardRelayResult(result);
      return true;
    }
    try {
      if (result.payload) {
        let failure: unknown;
        for (let attempt = 1; attempt <= toolResultMaxAttempts; attempt += 1) {
          if (!isCurrentRelaySession(snapshot)) {
            discardRelayResult(result);
            return true;
          }
          try {
            await client.sendToolResult(
              snapshot.sessionId,
              snapshot.resourceSessionId,
              result.toolCallId,
              result.payload
            );
            failure = undefined;
            break;
          } catch (error) {
            if (!isCurrentRelaySession(snapshot)) {
              discardRelayResult(result);
              return true;
            }
            if (error instanceof AgentHttpError && error.status === 409 && error.code === "tool_result_terminal") {
              const message = agentEventToUiMessage(
                {
                  seq: state.lastSeq,
                  type: "tool.result",
                  run_id: result.payload.run_id,
                  tool_call_id: result.toolCallId,
                  payload: { status: "unknown", done: true }
                },
                options.domain,
                options.messageMetadata()
              );
              if (message) options.onMessage({ ...message, id: `tool-${result.toolCallId}-unconfirmed` });
              failure = undefined;
              break;
            }
            failure = error;
            if (
              error instanceof AgentHttpError &&
              error.status >= 400 &&
              error.status < 500 &&
              error.status !== 408 &&
              error.status !== 429
            )
              break;
            if (attempt < toolResultMaxAttempts) {
              await waitForToolResultRetry(toolResultBaseDelayMs * 2 ** (attempt - 1));
            }
          }
        }
        if (failure) throw failure;
      }
      if (!isCurrentRelaySession(snapshot)) {
        discardRelayResult(result);
        return true;
      }
      result.complete(true);
    } catch (error) {
      if (!isCurrentRelaySession(snapshot)) {
        discardRelayResult(result);
        return true;
      }
      // Delivery is exhausted, but the executor may already have changed the resource.
      // Keep the event stream alive to reconcile the run and allow later requests.
      result.complete(true);
      const runId = result.payload?.run_id || snapshot.runId;
      const message = agentEventToUiMessage(
        {
          seq: state.lastSeq,
          type: "tool.result",
          run_id: runId,
          tool_call_id: result.toolCallId,
          payload: {
            status: "unknown",
            done: true,
            error: { message: error instanceof Error ? error.message : String(error) }
          }
        },
        options.domain,
        options.messageMetadata()
      );
      if (message) options.onMessage({ ...message, id: `tool-${result.toolCallId}-unconfirmed` });
      if (runId)
        await client
          .cancel(snapshot.sessionId, snapshot.resourceSessionId, runId, "tool_result_failed")
          .catch(() => undefined);
      return true;
    }
    return true;
  }

  async function cancel() {
    if (!state.agentSessionId || !state.resourceSessionId) return;
    await client.cancel(state.agentSessionId, state.resourceSessionId, state.activeRunId);
  }

  async function setApprovalMode(mode: AgentApprovalMode) {
    if (!["always", "auto", "never"].includes(mode)) return;
    if (options.allowedApprovalModes && !options.allowedApprovalModes.includes(mode)) {
      throw new Error(`Approval mode ${mode} is not allowed for the ${options.domain} agent`);
    }
    if (!state.agentSessionId || !state.resourceSessionId) {
      state.approvalMode = mode;
      options.onApprovalMode?.(mode);
      return;
    }
    await client.setApprovalMode(state.agentSessionId, state.resourceSessionId, { mode });
    state.approvalMode = mode;
    options.onApprovalMode?.(mode);
  }

  function dispose() {
    generation += 1;
    const sessionId = state.agentSessionId;
    const resourceSessionId = state.resourceSessionId || retainedResourceId;
    attachFlight = null;
    committedManifestKey = "";
    sse?.stop();
    sse = null;
    cancelAndResetRelay("controller_disposed");
    pendingApprovals.clear();
    resolvedApprovals.clear();
    pendingModelDurationByRun.clear();
    streamedAssistantMessageRuns.clear();
    localUserMessageIds.clear();
    presentedUserMessageIds.clear();
    const deleteReleasedSession = retainedResourceId ? client.releaseResource(retainedResourceId) : false;
    retainedResourceId = "";
    state.status = "closed";
    state.agentSessionId = "";
    state.resourceSessionId = "";
    state.activeRunId = "";
    state.toolNames = [];
    state.registrationIds = {};
    setAvailable(false);
    const cleanup = lifecycleTail
      .catch(() => undefined)
      .then(async () => {
        if (!deleteReleasedSession || !sessionId || !resourceSessionId) return;
        await client.deleteSession(sessionId, resourceSessionId).catch(() => undefined);
      });
    lifecycleTail = cleanup;
    return cleanup;
  }

  return {
    state,
    actions: {
      attachManifest,
      updateContext,
      sendMessage,
      resolveApproval,
      receiveKokoFrame,
      cancel,
      setApprovalMode,
      dispose
    }
  };
}
