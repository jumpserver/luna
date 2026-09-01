import type { UIMessage } from "ai";
import type {
  AgentApprovalDecision,
  AgentApprovalMode,
  AgentDomain,
  AgentEvent,
  AgentMcpManifest,
  AgentMessageRequest
} from "./types";
import type { AgentClient } from "./agentClient";
import type { AgentSseConnection } from "./agentSse";
import type { AgentToolRelayResult, AgentToolRelay } from "./agentToolRelay";
import { reactive } from "vue";
import { agentClient } from "./agentClient";
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
  errorCode: string;
  errorText: string;
}

interface AgentSessionOptions {
  domain: AgentDomain;
  relay: AgentToolRelay;
  messageMetadata: () => Record<string, unknown>;
  onMessage: (message: UIMessage) => void;
  onAvailability: (available: boolean) => void;
  onApprovalMode?: (mode: AgentApprovalMode) => void;
  onInputLock?: (locked: boolean) => void;
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
const USER_MESSAGE_DEDUP_LIMIT = 2_048;
const historyTextEncoder = new TextEncoder();

export interface AgentSessionController {
  state: AgentSessionState;
  actions: {
    attachManifest: (manifest: AgentMcpManifest) => Promise<void>;
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

const sensitiveMetadataKey = /(?:auth|cookie|token|password|secret|certificate|private[_-]?key|ticket)/i;

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
  for (const key of ["domain", "targetId", "terminalId", "context", "execution_mode"] as const) {
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
    if (toolName === "execute_command") return "executing";
    if (toolName === "database_schema") return "metadata_lookup";
    return "tool_running";
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
            payload.approved === true
              ? "approved"
              : payload.approved === false
                ? payload.reason === "run cancelled"
                  ? "cancelled"
                  : "rejected"
                : typeof payload.state === "string" && payload.state
                  ? payload.state
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
  const structuredContent = isRecord(result.structuredContent) ? result.structuredContent : {};
  const error = isRecord(payload.error) ? payload.error : null;
  const status = String(payload.status || "");
  const done = payload.done !== false;
  const outcome = !done
    ? "running"
    : error || result.isError === true || ["error", "failed"].includes(status)
      ? "error"
      : ["cancelled", "interrupted"].includes(status)
        ? "interrupted"
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

export function agentEventToUiMessage(
  event: AgentEvent,
  domain: AgentDomain,
  metadata: Record<string, unknown>
): UIMessage | null {
  const payload = event.payload || {};
  const eventMetadata = {
    ...metadata,
    agentEventType: event.type,
    ...(Number.isFinite(Number(payload.model_duration_ms))
      ? { modelDurationMs: Number(payload.model_duration_ms) }
      : {})
  };
  const embedded = payload.message ?? payload.ui_message;
  if (isUiMessage(embedded)) {
    return {
      ...embedded,
      id: eventMessageId(event),
      metadata: { ...eventMetadata, ...(isRecord(embedded.metadata) ? embedded.metadata : {}) }
    };
  }
  if (event.type.startsWith("message.") && Array.isArray(payload.parts)) {
    return {
      id: eventMessageId(event),
      role: payload.role === "user" || payload.role === "system" ? payload.role : "assistant",
      metadata: eventMetadata,
      parts: payload.parts
    } as UIMessage;
  }
  if (event.type.startsWith("message.") && typeof payload.text === "string") {
    return {
      id: eventMessageId(event),
      role: payload.role === "user" || payload.role === "system" ? payload.role : "assistant",
      metadata: eventMetadata,
      parts: [{ type: "text", text: payload.text }]
    } as UIMessage;
  }

  let part: Record<string, unknown> | null = null;
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
    part = { type: "data-progress", data: { ...payload, state: payload.state || stateByType[event.type] } };
  }
  if (event.type === "model.requested") {
    const code = Number(payload.round) > 1 || payload.phase ? "planning" : "analyzing";
    part = { type: "data-progress", data: { ...payload, code, state: code } };
  }
  if (event.type === "model.completed") {
    part = { type: "data-progress", data: { ...payload, code: "planning", state: "planning" } };
  }
  if (event.type === "run.failed") {
    part = {
      type: "data-error",
      data: { ...payload, code: "run_failed", message: payload.reason || "Agent run failed" }
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
    const code = agentToolProgressCode(domain, String(payload.tool_name || payload.name || ""));
    part = { type: "data-progress", data: { ...payload, toolCallId, code, state: code } };
  }
  if (event.type === "tool.result" && domain === "terminal") part = toolResultPresentation(event);
  if (event.type === "message.delta") {
    const delta = isRecord(payload.delta) ? payload.delta.text || payload.delta.delta : payload.delta || payload.text;
    if (typeof delta === "string") part = { type: "text", text: delta };
  }
  if (event.type === "message.completed" && !embedded) {
    part = { type: "data-progress", data: { ...payload, state: domain === "terminal" ? "idle" : "completed" } };
  }
  if (event.type === "error") part = { type: "data-error", data: payload };
  if (!part) return null;

  const parts: Record<string, unknown>[] = [];
  if (typeof payload.input_locked === "boolean") {
    parts.push({ type: "data-input-lock", data: { locked: payload.input_locked } });
  }
  parts.push(part);
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
  const localUserMessageIds = new Map<string, true>();
  const presentedUserMessageIds = new Map<string, true>();
  const pendingModelDurationByRun = new Map<string, number>();

  function rememberUserMessage(messages: Map<string, true>, messageId: string) {
    if (!messageId) return;
    messages.delete(messageId);
    messages.set(messageId, true);
    while (messages.size > USER_MESSAGE_DEDUP_LIMIT) {
      const oldest = messages.keys().next().value;
      if (typeof oldest !== "string") break;
      messages.delete(oldest);
    }
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
    if (event.type === "session.created") {
      applyApprovalMode(payload.approval_mode);
      if (Array.isArray(payload.tools)) state.toolNames = agentToolNames(payload.tools);
    }
    if (event.type === "run.started") state.activeRunId = event.run_id || "";
    if (["run.completed", "run.failed", "run.cancelled", "run.interrupted"].includes(event.type)) {
      state.activeRunId = "";
      if (runId) pendingModelDurationByRun.delete(runId);
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
      const binding = pendingApprovals.get(approvalId);
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
      if (approvalId) pendingApprovals.delete(approvalId);
    }
    if (event.type === "session.approval_mode_changed") {
      applyApprovalMode(payload.current || payload.mode || payload.approval_mode);
      return;
    }
    if (event.type === "tool.call" || event.type === "tool.cancel") {
      if (event.type === "tool.call" && runId) pendingModelDurationByRun.delete(runId);
      options.relay.forwardAgentEvent(event);
      if (event.type === "tool.call") {
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
      rememberUserMessage(presentedUserMessageIds, userMessageId);
      return;
    }
    if (userMessageId && presentedUserMessageIds.has(userMessageId)) return;
    const message = agentEventToUiMessage(presentationEvent, options.domain, options.messageMetadata());
    if (message) {
      options.onMessage(message);
      if (userMessageId) rememberUserMessage(presentedUserMessageIds, userMessageId);
    }
  }

  async function restoreHistory(
    sessionId: string,
    resourceSessionId: string,
    currentGeneration: number,
    manifest: AgentMcpManifest,
    startAfter = 0
  ) {
    const events: AgentEvent[] = [];
    let after = startAfter;
    let historyBytes = 0;
    while (true) {
      const history = await client.history(sessionId, resourceSessionId, after);
      if (generation !== currentGeneration) return after;
      for (const event of history.events) {
        historyBytes += historyTextEncoder.encode(JSON.stringify(event)).byteLength + 1;
        if (events.length >= historyMaxEvents || historyBytes > historyMaxBytes) {
          throw new AgentSessionHistoryLimitError("Agent history exceeds the bounded recovery limit");
        }
        events.push(event);
      }
      const nextCursor = Math.max(0, Math.floor(Number(history.next_cursor) || 0));
      if (!history.has_more) {
        after = Math.max(after, nextCursor);
        break;
      }
      if (nextCursor <= after) throw new Error("Agent history cursor did not advance");
      after = nextCursor;
    }

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
    }

    const eventRunId = (event: AgentEvent) => String(event.run_id || event.payload?.run_id || "");
    const eventToolCallId = (event: AgentEvent) => String(event.tool_call_id || event.payload?.tool_call_id || "");
    const terminalRuns = new Set(
      events.flatMap((event) =>
        ["run.completed", "run.failed", "run.cancelled", "run.interrupted"].includes(event.type) && eventRunId(event)
          ? [eventRunId(event)]
          : []
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
    pendingModelDurationByRun.clear();
    state.status = "creating";
    state.agentSessionId = "";
    state.resourceSessionId = manifest.resourceSessionId;
    state.activeRunId = "";
    state.revision = manifest.revision;
    state.toolNames = agentToolNames(manifest.tools);
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
        const created = await client.createSession(manifest, state.approvalMode);
        agentSessionId = String(created.session_id || "");
        acquiredSessionId = agentSessionId;
        if (generation !== currentGeneration) return;
        after = Math.max(0, Math.floor(Number(created.after) || 0));
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
          const created = await client.createSession(manifest, state.approvalMode);
          agentSessionId = String(created.session_id || "");
          acquiredSessionId = agentSessionId;
          if (generation !== currentGeneration) return;
          after = Math.max(0, Math.floor(Number(created.after) || 0));
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
    rememberUserMessage(localUserMessageIds, request.message_id);
    try {
      await client.sendMessage(state.agentSessionId, state.resourceSessionId, request);
    } catch (error) {
      localUserMessageIds.delete(request.message_id);
      throw error;
    }
  }

  async function resolveApproval(approvalId: string, decision: AgentApprovalDecision) {
    if (!state.agentSessionId || !state.resourceSessionId) throw new Error("Agent session is unavailable");
    const binding = pendingApprovals.get(approvalId);
    await client.resolveApproval(state.agentSessionId, state.resourceSessionId, approvalId, {
      decision,
      ...(binding?.runId ? { run_id: binding.runId } : {}),
      ...(binding?.digest ? { digest: binding.digest } : {})
    });
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
    pendingModelDurationByRun.clear();
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
            failure = error;
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
      discardRelayResult(result);
      if (!isCurrentRelaySession(snapshot)) return true;
      const failure = await failToolRelay(error, snapshot);
      if (failure) throw failure;
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
    pendingModelDurationByRun.clear();
    localUserMessageIds.clear();
    presentedUserMessageIds.clear();
    const deleteReleasedSession = retainedResourceId ? client.releaseResource(retainedResourceId) : false;
    retainedResourceId = "";
    state.status = "closed";
    state.agentSessionId = "";
    state.resourceSessionId = "";
    state.activeRunId = "";
    state.toolNames = [];
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
    actions: { attachManifest, sendMessage, resolveApproval, receiveKokoFrame, cancel, setApprovalMode, dispose }
  };
}
