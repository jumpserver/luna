import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import type { AgentApprovalMode, KokoMcpCancelFrame, KokoMcpRequestFrame } from "#koko/composables/agent/types";
import type { AgentSessionController } from "#koko/composables/agent/useAgentSession";

import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import { isRecord, kokoMcpWireMessage, manifestFromFrame, parseKokoMcpFrame } from "#koko/composables/agent/types";
import { useAgentSession } from "#koko/composables/agent/useAgentSession";

const SQL_CONTEXT_META_KEY = "com.jumpserver/sqlContext";
const SQL_OPERATION_META_KEY = "com.jumpserver/sqlOperation";
const SQL_METADATA_CATEGORIES = [
  "connection_metadata",
  "tables",
  "columns",
  "primary_keys",
  "foreign_keys",
  "indexes",
  "comments",
  "default_values"
];

export type ChenSqlAiOperation = "generate" | "explain" | "repair";
export type ChenSqlAiEventData = Record<string, any>;
export type ChenSqlAiChatMessage = UIMessage<ChenSqlAiEventData, Record<string, ChenSqlAiEventData>>;
export type ChenSqlAiFrameSender = (frame: ReturnType<typeof kokoMcpWireMessage>) => boolean;

export interface ChenSqlEditorContext {
  dialect: string;
  database?: string;
  schema?: string;
  nodeKey: string;
  consoleId: string;
  paneId: string;
  tabId: string;
  workspaceTabId: string;
  workspaceTabKind: "query" | "console" | "data-view" | "database" | "none";
  currentContext: string;
  revision: number;
  selectionFrom: number;
  selectionTo: number;
  selectedSql: string;
  documentSql: string;
  lastError?: Record<string, any> | null;
}

export interface ChenSqlProposal {
  sql: string;
  originalSql?: string;
  explanation?: string;
  analysis?: ChenSqlAiEventData;
  base: {
    paneId: string;
    tabId: string;
    revision: number;
    target: "selection" | "document" | "new_query";
    selectionFrom: number;
    selectionTo: number;
    nodeKey: string;
    database?: string;
    schema?: string;
    workspaceTabId?: string;
    workspaceTabKind?: "query" | "console" | "data-view" | "database" | "none";
    currentContext?: string;
  };
}

export interface ChenSqlProposalApplyResult {
  applied: boolean;
  reason?: string;
}

export interface ChenSqlAiTiming {
  durationMs: number;
  clientDurationMs: number;
  rounds: number;
  round: number;
  maximumRound: number;
  modelRequests: number;
  modelDurationMs: number;
  toolCalls: number;
  toolDurationMs: number;
  queueDurationMs: number;
  tool: string;
}

export interface ChenSqlMetadataApproval {
  approvalId: string;
  requestId: string;
  toolCallId: string;
  provider: string;
  model: string;
  database: string;
  schema: string;
  tables: string[];
  query: string;
  discovery: boolean;
  maxMatches: number;
  followUpTableLimit: number;
  dataCategories: string[];
  expandedScope: boolean;
  expiresInSeconds: number;
  resolving: boolean;
}

export type ChenSqlMetadataApprovalDecision = "approve_once" | "approve_session" | "reject";

export interface ChenSqlAiSession {
  kind: "sql";
  paneId: string;
  sendFrame: ChenSqlAiFrameSender;
  terminalId: string;
  resourceSessionId: string;
  agent: AgentSessionController;
  chat: UseChatHelpers<ChenSqlAiChatMessage>;
  enabled: boolean;
  approvalMode: AgentApprovalMode;
  provider: string;
  model: string;
  backgroundExec: boolean;
  backgroundReason: string;
  backgroundReasonCode: string;
  approvalThreshold: number;
  executionMode: string;
  inputLocked: boolean;
  taskActive: boolean;
  draft: string;
  runtimeStatus: string;
  runtimeStatusCode: string;
  runtimeState: string;
  runtimeExecution: string;
  requestStartedAt: number;
  timing: ChenSqlAiTiming;
  errorCode: string;
  errorText: string;
  metadataApproval: ChenSqlMetadataApproval | null;
  decisions: Set<string>;
  executionOverrides: Map<string, string>;
  expansionOverrides: Map<string, boolean>;
  proposalDecisions: Map<string, "applied" | "rejected" | "stale">;
  contextProvider: () => ChenSqlEditorContext | null;
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult;
  request: (operation: ChenSqlAiOperation, question: string) => Promise<void>;
  cancelActive: () => void;
  resolveMetadataApproval: (decision: ChenSqlMetadataApprovalDecision) => void;
  applyProposal: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult;
}

type ChenSqlAiRuntimeSession = ChenSqlAiSession & { activeOperation: ChenSqlAiOperation };

class ChenSqlAiClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ChenSqlAiClientError";
  }
}

interface ActiveResponse {
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  started: boolean;
  openTextIds: Set<string>;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

class ChenSqlAiTransport implements ChatTransport<ChenSqlAiChatMessage> {
  private activeResponse: ActiveResponse | null = null;

  constructor(private readonly getSession: () => ChenSqlAiSession) {}

  sendMessages: ChatTransport<ChenSqlAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    const session = this.getSession();
    if (!session.enabled || !session.agent.state.available) {
      throw new ChenSqlAiClientError("unavailable", "SQL AI is unavailable for this database session");
    }
    if (this.activeResponse) {
      throw new ChenSqlAiClientError("response_active", "Another SQL AI request is active");
    }

    const message = messages.at(-1);
    const operation = String(message?.metadata?.operation || "generate") as ChenSqlAiOperation;
    if (
      !message ||
      message.role !== "user" ||
      !session.contextProvider() ||
      !["generate", "explain", "repair"].includes(operation)
    ) {
      throw new ChenSqlAiClientError("invalid_context", "An active SQL editor context is required");
    }

    let response: ActiveResponse | null = null;
    try {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const stream = new ReadableStream<UIMessageChunk>({
        start: (streamController) => {
          controller = streamController;
        },
        cancel: () => {
          if (response) this.clear(response);
        }
      });
      response = { controller, started: false, openTextIds: new Set(), abortSignal };
      this.activeResponse = response;
      const abortHandler = () => {
        void session.agent.actions.cancel();
        this.finish(response!);
      };
      if (abortSignal) {
        response.abortHandler = abortHandler;
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }
      if (abortSignal?.aborted) throw new DOMException("SQL AI request was aborted", "AbortError");

      session.taskActive = true;
      session.requestStartedAt = Date.now();
      session.timing = emptyChenSqlAiTiming();
      session.runtimeStatus = "";
      session.runtimeStatusCode = "analyzing";
      session.runtimeState = "running";
      session.runtimeExecution = "";
      session.metadataApproval = null;
      await session.agent.actions.sendMessage({
        ...message,
        metadata: { ...message.metadata, domain: "sql", targetId: session.paneId, operation }
      });
      return stream;
    } catch (cause) {
      const error =
        cause instanceof ChenSqlAiClientError
          ? cause
          : new ChenSqlAiClientError(
              "send_failed",
              cause instanceof Error ? cause.message : "Failed to send SQL AI request"
            );
      if (response) this.fail(response, error);
      throw error;
    }
  };

  reconnectToStream: ChatTransport<ChenSqlAiChatMessage>["reconnectToStream"] = async () => null;

  receive(message: ChenSqlAiChatMessage) {
    const response = this.activeResponse;
    if (!response || message.role !== "assistant") return false;
    if (!response.started) {
      response.controller.enqueue({
        type: "start",
        messageId: message.id,
        messageMetadata: message.metadata
      });
      response.started = true;
    } else if (message.metadata) {
      response.controller.enqueue({ type: "message-metadata", messageMetadata: message.metadata });
    }

    for (const [index, part] of message.parts.entries()) {
      const id = `${message.id}-${index}`;
      if (part.type === "text") {
        const isDelta = message.metadata?.agentEventType === "message.delta";
        if (!response.openTextIds.has(id)) {
          response.controller.enqueue({ type: "text-start", id });
          response.openTextIds.add(id);
        }
        response.controller.enqueue({ type: "text-delta", id, delta: part.text });
        if (!isDelta) {
          response.controller.enqueue({ type: "text-end", id });
          response.openTextIds.delete(id);
        }
      } else if (part.type.startsWith("data-") && "data" in part) {
        response.controller.enqueue({ type: part.type, id, data: part.data });
      }
    }
    return true;
  }

  finish(response = this.activeResponse) {
    if (!response) return;
    for (const id of response.openTextIds) response.controller.enqueue({ type: "text-end", id });
    if (response.started) response.controller.enqueue({ type: "finish", finishReason: "stop" });
    response.controller.close();
    this.clear(response);
  }

  fail(response: ActiveResponse | null, error: Error) {
    if (!response || response !== this.activeResponse) return;
    response.controller.error(error);
    this.clear(response);
  }

  disconnect() {
    this.finish();
  }

  private clear(response: ActiveResponse) {
    if (response.abortSignal && response.abortHandler) {
      response.abortSignal.removeEventListener("abort", response.abortHandler);
    }
    if (this.activeResponse === response) this.activeResponse = null;
  }
}

const sessions = shallowReactive(new Map<string, ChenSqlAiSession>());
const transports = new WeakMap<ChenSqlAiSession, ChenSqlAiTransport>();
const chatScopes = new WeakMap<ChenSqlAiSession, EffectScope>();

function currentOperation(session: ChenSqlAiSession): ChenSqlAiOperation {
  return (session as ChenSqlAiRuntimeSession).activeOperation || "generate";
}

function sendToolFrame(session: ChenSqlAiSession, frame: KokoMcpRequestFrame | KokoMcpCancelFrame) {
  let outgoing: KokoMcpRequestFrame | KokoMcpCancelFrame = frame;
  if (frame.type === "mcp.request") {
    const request = frame as KokoMcpRequestFrame;
    const context = session.contextProvider();
    if (!context) throw new ChenSqlAiClientError("invalid_context", "An active SQL editor context is required");
    const operation = currentOperation(session);
    const verifiedContext = operation === "repair" ? context : { ...context, lastError: null };
    const metadata = isRecord(request.data.params._meta) ? request.data.params._meta : {};
    outgoing = {
      ...request,
      data: {
        ...request.data,
        params: {
          ...request.data.params,
          _meta: {
            ...metadata,
            [SQL_CONTEXT_META_KEY]: verifiedContext,
            [SQL_OPERATION_META_KEY]: operation
          }
        }
      }
    };
  }
  if (!session.sendFrame(kokoMcpWireMessage(outgoing))) {
    throw new ChenSqlAiClientError("unavailable", "Chen SQL tools are unavailable");
  }
}

function createSession(
  paneId: string,
  sendFrame: ChenSqlAiFrameSender,
  contextProvider: () => ChenSqlEditorContext | null,
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult
) {
  let session: ChenSqlAiSession;
  const transport = markRaw(new ChenSqlAiTransport(() => session));
  const relay = markRaw(
    new AgentToolRelay({
      resourceSessionId: () => session.resourceSessionId,
      revision: () => session.agent.state.revision || 1,
      sendFrame: (frame) => sendToolFrame(session, frame)
    })
  );
  const agent = markRaw(
    useAgentSession({
      domain: "sql",
      relay,
      messageMetadata: () => ({ domain: "sql", targetId: paneId, operation: currentOperation(session) }),
      onMessage: (message) => handleChenSqlAiMessage(paneId, message),
      onAvailability: (available) => {
        if (session) session.enabled = available;
      },
      onApprovalMode: (mode) => {
        if (session) session.approvalMode = mode;
      },
      onInputLock: (locked) => {
        if (session) session.inputLocked = locked;
      },
      onUnavailable: (cause) => {
        if (!session) return;
        session.enabled = false;
        session.taskActive = false;
        session.errorCode = "agent_unavailable";
        session.errorText = cause.message;
        transport.disconnect();
      }
    })
  );
  const chatScope = effectScope(true);
  const chat = markRaw(
    chatScope.run(() =>
      useChat<ChenSqlAiChatMessage>({
        id: `chen-sql:${paneId}`,
        transport,
        generateId: () => createChenSqlAiMessageId("message"),
        onError: (cause) => {
          finishChenSqlAiTiming(session);
          session.taskActive = false;
          session.inputLocked = false;
          session.runtimeStatus = "";
          session.runtimeStatusCode = "";
          session.runtimeState = "idle";
          session.metadataApproval = null;
          session.errorCode = cause instanceof ChenSqlAiClientError ? cause.code : "failed";
          session.errorText = cause.message;
        }
      })
    )!
  );

  session = reactive({
    kind: "sql",
    paneId,
    sendFrame,
    terminalId: "",
    resourceSessionId: "",
    agent,
    chat,
    enabled: false,
    approvalMode: "auto",
    provider: "",
    model: "",
    backgroundExec: false,
    backgroundReason: "",
    backgroundReasonCode: "",
    approvalThreshold: 4,
    executionMode: "draft_only",
    inputLocked: false,
    taskActive: false,
    activeOperation: "generate",
    draft: "",
    runtimeStatus: "",
    runtimeStatusCode: "",
    runtimeState: "",
    runtimeExecution: "",
    requestStartedAt: 0,
    timing: emptyChenSqlAiTiming(),
    errorCode: "",
    errorText: "",
    metadataApproval: null,
    decisions: new Set<string>(),
    executionOverrides: new Map<string, string>(),
    expansionOverrides: new Map<string, boolean>(),
    proposalDecisions: new Map<string, "applied" | "rejected" | "stale">(),
    contextProvider: markRaw(contextProvider),
    proposalApplier: markRaw(proposalApplier),
    request: async (operation: ChenSqlAiOperation, question: string) => {
      const text = question.trim();
      if (!text) throw new ChenSqlAiClientError("invalid_message", "SQL AI requires a user message");
      (session as ChenSqlAiRuntimeSession).activeOperation = operation;
      session.errorCode = "";
      session.errorText = "";
      session.chat.clearError();
      await session.chat.sendMessage({ text, metadata: { domain: "sql", targetId: paneId, operation } });
    },
    cancelActive: () => {
      void session.agent.actions.cancel().catch((cause) => {
        session.errorCode = "cancel_failed";
        session.errorText = cause instanceof Error ? cause.message : "Failed to cancel SQL AI request";
      });
      session.chat.stop();
    },
    resolveMetadataApproval: (decision: ChenSqlMetadataApprovalDecision) => {
      const approval = session.metadataApproval;
      if (!approval || approval.resolving) return;
      approval.resolving = true;
      void session.agent.actions
        .resolveApproval(approval.approvalId, decision === "reject" ? "reject" : "approve")
        .catch((cause) => {
          approval.resolving = false;
          session.errorCode = "approval_failed";
          session.errorText = cause instanceof Error ? cause.message : "Failed to resolve metadata approval";
        });
    },
    applyProposal: (proposal: ChenSqlProposal) => session.proposalApplier(proposal)
  }) as ChenSqlAiSession;
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  return session;
}

export function registerChenSqlAiSession(
  paneId: string,
  sendFrame: ChenSqlAiFrameSender,
  contextProvider: () => ChenSqlEditorContext | null,
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult
) {
  if (!paneId) return null;
  const existing = sessions.get(paneId);
  if (existing?.sendFrame === sendFrame) {
    existing.contextProvider = markRaw(contextProvider);
    existing.proposalApplier = markRaw(proposalApplier);
    return existing;
  }
  if (existing) unregisterChenSqlAiSession(paneId);
  const session = createSession(paneId, sendFrame, contextProvider, proposalApplier);
  sessions.set(paneId, session);
  return session;
}

export function unregisterChenSqlAiSession(paneId: string, sendFrame?: ChenSqlAiFrameSender) {
  const session = sessions.get(paneId);
  if (!session || (sendFrame && session.sendFrame !== sendFrame)) return;
  transports.get(session)?.disconnect();
  void session.agent.actions.dispose();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(paneId);
}

export function getChenSqlAiSession(paneId: string) {
  return sessions.get(paneId) || null;
}

export function handleChenSqlAiWireMessage(paneId: string, value: unknown) {
  const session = sessions.get(paneId);
  const frame = parseKokoMcpFrame(value);
  if (!session || !frame) return false;
  if (frame.type === "mcp.manifest") {
    if (frame.data.profile !== "sql") return false;
    session.resourceSessionId = frame.resource_session_id;
    void session.agent.actions.attachManifest(manifestFromFrame(frame)).catch((cause) => {
      session.enabled = false;
      session.errorCode = "agent_unavailable";
      session.errorText = cause instanceof Error ? cause.message : "Failed to create SQL AI session";
    });
    return true;
  }
  if (frame.resource_session_id !== session.resourceSessionId) return false;
  void session.agent.actions.receiveKokoFrame(frame).catch((cause) => {
    session.errorCode = "tool_result_failed";
    session.errorText = cause instanceof Error ? cause.message : "Failed to deliver SQL AI tool result";
  });
  return true;
}

export function handleChenSqlAiError(paneId: string, data: ChenSqlAiEventData) {
  const session = sessions.get(paneId);
  if (!session) return;
  session.enabled = false;
  session.taskActive = false;
  session.inputLocked = false;
  session.errorCode = String(data.code || "failed");
  session.errorText = String(data.message || "SQL AI failed");
  finishChenSqlAiTiming(session);
  session.runtimeStatus = "";
  session.runtimeStatusCode = "";
  session.runtimeState = "idle";
  session.metadataApproval = null;
  transports.get(session)?.disconnect();
}

export function handleChenSqlAiMessage(paneId: string, value: unknown) {
  const session = sessions.get(paneId);
  if (!session || !isChenSqlAiChatMessage(value)) return;
  const message = value;
  const transport = transports.get(session);

  const capability = partData(message, "data-capability");
  if (capability) session.enabled = Boolean(capability.enabled);
  const inputLock = partData(message, "data-input-lock");
  if (inputLock) session.inputLocked = Boolean(inputLock.locked);

  const approval = partData(message, "data-approval");
  if (approval?.resolved === true) {
    if (session.metadataApproval?.approvalId === String(approval.approvalId || approval.id || "")) {
      session.metadataApproval = null;
    }
  } else if (String(approval?.tool || "") === "inspect_schema") {
    const argumentsValue = isRecord(approval?.arguments) ? approval.arguments : {};
    const context = session.contextProvider();
    const query = String(argumentsValue.query || "").slice(0, 1024);
    const tables = boundedStringArray(argumentsValue.tables, 8);
    session.metadataApproval = {
      approvalId: String(approval?.approvalId || approval?.id || ""),
      requestId: String(approval?.runId || ""),
      toolCallId: String(approval?.toolCallId || ""),
      provider: session.provider,
      model: session.model,
      database: String(context?.database || ""),
      schema: String(argumentsValue.schema || context?.schema || "").slice(0, 1024),
      tables,
      query,
      discovery: query === "*",
      maxMatches: 100,
      followUpTableLimit: 8,
      dataCategories: [...SQL_METADATA_CATEGORIES],
      expandedScope: query === "*" || Boolean(query && !tables.length),
      expiresInSeconds: 300,
      resolving: false
    };
    session.runtimeStatusCode = "approval";
    session.runtimeState = "running";
    session.runtimeExecution = "inspect_schema";
  }

  const progress = partData(message, "data-progress");
  const runtimeState = String(progress?.state || "");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    session.runtimeStatusCode = String(progress.code || "");
    session.runtimeState = runtimeState;
    session.runtimeExecution = String(progress.tool_name || progress.name || progress.tool || "");
    updateChenSqlAiTiming(session, progress);
    if (["completed", "failed", "cancelled", "interrupted"].includes(runtimeState)) {
      session.taskActive = false;
      session.inputLocked = false;
      finishChenSqlAiTiming(session);
    } else if (runtimeState) {
      session.taskActive = true;
    }
  }
  const runtimeError = partData(message, "data-error");
  if (runtimeError) {
    session.taskActive = false;
    session.inputLocked = false;
    session.errorCode = String(runtimeError.code || "failed");
    session.errorText = String(runtimeError.message || "SQL AI failed");
  }

  if (!transport?.receive(message)) session.chat.messages.value = [...session.chat.messages.value, message];
  if (!session.enabled || runtimeError || ["completed", "failed", "cancelled", "interrupted"].includes(runtimeState)) {
    transport?.finish();
  }
}

function emptyChenSqlAiTiming(): ChenSqlAiTiming {
  return {
    durationMs: 0,
    clientDurationMs: 0,
    rounds: 0,
    round: 0,
    maximumRound: 0,
    modelRequests: 0,
    modelDurationMs: 0,
    toolCalls: 0,
    toolDurationMs: 0,
    queueDurationMs: 0,
    tool: ""
  };
}

function updateChenSqlAiTiming(session: ChenSqlAiSession, data: ChenSqlAiEventData) {
  const next = { ...session.timing };
  const numberKeys: Exclude<keyof ChenSqlAiTiming, "tool">[] = [
    "durationMs",
    "clientDurationMs",
    "rounds",
    "round",
    "maximumRound",
    "modelRequests",
    "modelDurationMs",
    "toolCalls",
    "toolDurationMs",
    "queueDurationMs"
  ];
  for (const key of numberKeys) {
    if (data[key] === undefined) continue;
    const number = Number(data[key]);
    if (Number.isFinite(number) && number >= 0) next[key] = number;
  }
  if (data.tool !== undefined) next.tool = String(data.tool || "");
  session.timing = next;
}

function finishChenSqlAiTiming(session: ChenSqlAiSession) {
  if (session.requestStartedAt <= 0) return;
  session.timing.clientDurationMs = Math.max(session.timing.clientDurationMs, Date.now() - session.requestStartedAt);
  session.requestStartedAt = 0;
}

function partData(message: ChenSqlAiChatMessage, type: string) {
  const part = message.parts.find((candidate) => candidate.type === type);
  return part && "data" in part ? (part.data as ChenSqlAiEventData) : undefined;
}

function boundedStringArray(value: unknown, maximum: number) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maximum).map((item) => String(item).slice(0, 1024));
}

function isChenSqlAiChatMessage(value: unknown): value is ChenSqlAiChatMessage {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if ((value.role !== "user" && value.role !== "assistant") || !Array.isArray(value.parts)) return false;
  return value.parts.every((part) => {
    if (!isRecord(part) || typeof part.type !== "string") return false;
    return part.type === "text" ? typeof part.text === "string" : part.type.startsWith("data-") && "data" in part;
  });
}

export function createChenSqlAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
