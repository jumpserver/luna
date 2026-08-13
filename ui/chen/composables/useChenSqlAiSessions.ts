import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";

import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";

export type ChenSqlAiOperation = "generate" | "explain" | "repair";
export type ChenSqlAiEventData = Record<string, any>;
export type ChenSqlAiChatMessage = UIMessage<ChenSqlAiEventData, Record<string, ChenSqlAiEventData>>;

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

export interface ChenSqlAiSession {
  kind: "sql";
  paneId: string;
  socket: WebSocket | null;
  terminalId: string;
  chat: UseChatHelpers<ChenSqlAiChatMessage>;
  enabled: boolean;
  provider: string;
  model: string;
  backgroundExec: boolean;
  backgroundReason: string;
  backgroundReasonCode: string;
  approvalThreshold: number;
  executionMode: string;
  inputLocked: boolean;
  draft: string;
  runtimeStatus: string;
  runtimeStatusCode: string;
  runtimeState: string;
  runtimeExecution: string;
  requestStartedAt: number;
  timing: ChenSqlAiTiming;
  errorCode: string;
  errorText: string;
  decisions: Set<string>;
  executionOverrides: Map<string, string>;
  expansionOverrides: Map<string, boolean>;
  proposalDecisions: Map<string, "applied" | "rejected" | "stale">;
  contextProvider: () => ChenSqlEditorContext | null;
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult;
  request: (operation: ChenSqlAiOperation, question: string) => Promise<void>;
  cancelActive: () => void;
  applyProposal: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult;
}

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
  id: string;
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  started: boolean;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

class ChenSqlAiTransport implements ChatTransport<ChenSqlAiChatMessage> {
  private activeResponse: ActiveResponse | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly enabled: () => boolean,
    private readonly contextProvider: () => ChenSqlEditorContext | null,
    private readonly onRequestStart: () => void
  ) {}

  sendMessages: ChatTransport<ChenSqlAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    if (this.activeResponse) throw new ChenSqlAiClientError("response_active", "Another SQL AI request is active");
    if (!this.enabled() || this.socket.readyState !== WebSocket.OPEN) {
      throw new ChenSqlAiClientError("unavailable", "SQL AI is unavailable for this database session");
    }

    const message = messages.at(-1);
    const question = message?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    const operation = String(message?.metadata?.operation || "generate") as ChenSqlAiOperation;
    const providedContext = this.contextProvider();
    const context =
      providedContext && operation !== "repair" ? { ...providedContext, lastError: null } : providedContext;
    if (!message || message.role !== "user" || !question || !context) {
      throw new ChenSqlAiClientError("invalid_context", "An active SQL editor context is required");
    }
    const requestId = createChenSqlAiMessageId("request");
    this.onRequestStart();
    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.activeResponse = { id: requestId, controller, started: false, abortSignal };
      },
      cancel: () => this.clearActiveResponse()
    });

    const abortHandler = () => {
      try {
        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: "ai_cancel", data: { requestId } }));
        }
      } finally {
        this.finish(requestId);
      }
    };
    if (abortSignal) {
      this.activeResponse!.abortHandler = abortHandler;
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      this.socket.send(
        JSON.stringify({
          type: "ai_request",
          data: { id: requestId, operation, question, context }
        })
      );
    } catch (cause) {
      const error = new ChenSqlAiClientError(
        "send_failed",
        cause instanceof Error ? cause.message : "Failed to send SQL AI request"
      );
      this.fail(error, requestId);
      throw error;
    }
    return stream;
  };

  reconnectToStream: ChatTransport<ChenSqlAiChatMessage>["reconnectToStream"] = async () => null;

  activeRequestId() {
    return this.activeResponse?.id || "";
  }

  receive(message: ChenSqlAiChatMessage) {
    const response = this.activeResponse;
    const requestId = String(message.metadata?.requestId || "");
    if (!response || message.role !== "assistant" || (requestId && requestId !== response.id)) return false;

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
        response.controller.enqueue({ type: "text-start", id });
        response.controller.enqueue({ type: "text-delta", id, delta: part.text });
        response.controller.enqueue({ type: "text-end", id });
        continue;
      }
      if (!part.type.startsWith("data-") || !("data" in part)) continue;
      if (part.type === "data-error") {
        const data = part.data as ChenSqlAiEventData;
        this.fail(
          new ChenSqlAiClientError(String(data.code || "failed"), String(data.message || "SQL AI failed")),
          response.id
        );
        return true;
      }
      response.controller.enqueue({ type: part.type, id, data: part.data });
    }
    return true;
  }

  finish(requestId = "") {
    const response = this.activeResponse;
    if (!response || (requestId && response.id !== requestId)) return;
    if (response.started) response.controller.enqueue({ type: "finish", finishReason: "stop" });
    response.controller.close();
    this.clearActiveResponse();
  }

  fail(error: Error, requestId = "") {
    const response = this.activeResponse;
    if (!response || (requestId && response.id !== requestId)) return;
    response.controller.error(error);
    this.clearActiveResponse();
  }

  disconnect() {
    this.finish();
  }

  private clearActiveResponse() {
    const response = this.activeResponse;
    if (response?.abortSignal && response.abortHandler) {
      response.abortSignal.removeEventListener("abort", response.abortHandler);
    }
    this.activeResponse = null;
  }
}

const sessions = shallowReactive(new Map<string, ChenSqlAiSession>());
const transports = new WeakMap<ChenSqlAiSession, ChenSqlAiTransport>();
const chatScopes = new WeakMap<ChenSqlAiSession, EffectScope>();

function createSession(
  paneId: string,
  socket: WebSocket,
  contextProvider: () => ChenSqlEditorContext | null,
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult
) {
  let session: ChenSqlAiSession;
  const transport = markRaw(
    new ChenSqlAiTransport(
      socket,
      () => session.enabled,
      () => session.contextProvider(),
      () => {
        session.requestStartedAt = Date.now();
        session.timing = emptyChenSqlAiTiming();
        session.runtimeStatus = "";
        session.runtimeStatusCode = "analyzing";
        session.runtimeState = "running";
        session.runtimeExecution = "";
      }
    )
  );
  const chatScope = effectScope(true);
  const chat = markRaw(
    chatScope.run(() =>
      useChat<ChenSqlAiChatMessage>({
        id: `chen-sql:${paneId}`,
        transport,
        generateId: () => createChenSqlAiMessageId("message"),
        onError: (error) => {
          finishChenSqlAiTiming(session);
          session.runtimeStatus = "";
          session.runtimeStatusCode = "";
          session.runtimeState = "idle";
          if (error instanceof ChenSqlAiClientError) {
            session.errorCode = error.code;
            session.errorText = error.message;
          } else {
            session.errorCode ||= "failed";
            session.errorText = error.message;
          }
        }
      })
    )!
  );

  session = reactive({
    kind: "sql",
    paneId,
    socket: markRaw(socket),
    terminalId: "",
    chat,
    enabled: false,
    provider: "",
    model: "",
    backgroundExec: false,
    backgroundReason: "",
    backgroundReasonCode: "",
    approvalThreshold: 4,
    executionMode: "draft_only",
    inputLocked: false,
    draft: "",
    runtimeStatus: "",
    runtimeStatusCode: "",
    runtimeState: "",
    runtimeExecution: "",
    requestStartedAt: 0,
    timing: emptyChenSqlAiTiming(),
    errorCode: "",
    errorText: "",
    decisions: new Set<string>(),
    executionOverrides: new Map<string, string>(),
    expansionOverrides: new Map<string, boolean>(),
    proposalDecisions: new Map<string, "applied" | "rejected" | "stale">(),
    contextProvider: markRaw(contextProvider),
    proposalApplier: markRaw(proposalApplier),
    request: async (operation: ChenSqlAiOperation, question: string) => {
      await session.chat.sendMessage({ text: question, metadata: { operation } });
    },
    cancelActive: () => {
      const requestId = transport.activeRequestId();
      if (!requestId || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "ai_cancel", data: { requestId } }));
      } catch (cause) {
        session.errorCode = "cancel_failed";
        session.errorText = cause instanceof Error ? cause.message : "Failed to cancel SQL AI request";
      }
    },
    applyProposal: (proposal: ChenSqlProposal) => session.proposalApplier(proposal)
  }) as ChenSqlAiSession;
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  return session;
}

export function registerChenSqlAiSession(
  paneId: string,
  socket: WebSocket,
  contextProvider: () => ChenSqlEditorContext | null,
  proposalApplier: (proposal: ChenSqlProposal) => ChenSqlProposalApplyResult
) {
  if (!paneId) return null;
  const existing = sessions.get(paneId);
  if (existing?.socket === socket) {
    existing.contextProvider = markRaw(contextProvider);
    existing.proposalApplier = markRaw(proposalApplier);
    return existing;
  }
  if (existing) unregisterChenSqlAiSession(paneId);
  const session = createSession(paneId, socket, contextProvider, proposalApplier);
  sessions.set(paneId, session);
  return session;
}

export function unregisterChenSqlAiSession(paneId: string, socket?: WebSocket | null) {
  const session = sessions.get(paneId);
  if (!session || (socket && session.socket !== socket)) return;
  transports.get(session)?.disconnect();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(paneId);
}

export function getChenSqlAiSession(paneId: string) {
  return sessions.get(paneId) || null;
}

export function handleChenSqlAiReady(paneId: string, data: ChenSqlAiEventData) {
  const session = sessions.get(paneId);
  if (!session) return;
  session.enabled = Boolean(data.enabled);
  session.provider = String(data.provider || "");
  session.model = String(data.model || "");
  session.errorCode = data.enabled ? "" : "unavailable";
  session.errorText = data.enabled ? "" : String(data.reason || "SQL AI is unavailable");
}

export function handleChenSqlAiError(paneId: string, data: ChenSqlAiEventData) {
  const session = sessions.get(paneId);
  if (!session) return;
  session.errorCode = String(data.code || "failed");
  session.errorText = String(data.message || "SQL AI failed");
  finishChenSqlAiTiming(session);
  session.runtimeStatus = "";
  session.runtimeStatusCode = "";
  session.runtimeState = "idle";
  transports
    .get(session)
    ?.fail(new ChenSqlAiClientError(session.errorCode, session.errorText), String(data.requestId || ""));
}

export function handleChenSqlAiMessage(paneId: string, message: unknown) {
  const session = sessions.get(paneId);
  if (!session || !isChenSqlAiChatMessage(message)) return;
  const capability = partData(message, "data-capability");
  if (capability) {
    session.enabled = Boolean(capability.enabled);
    session.provider = String(capability.provider || session.provider);
    session.model = String(capability.model || session.model);
    return;
  }
  const progress = partData(message, "data-progress");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    session.runtimeStatusCode = String(progress.code || "");
    session.runtimeState = String(progress.state || "");
    session.runtimeExecution = String(progress.tool || "");
    updateChenSqlAiTiming(session, progress);
    if (session.runtimeState === "idle") {
      finishChenSqlAiTiming(session);
      transports.get(session)?.finish(String(message.metadata?.requestId || ""));
    }
    return;
  }
  const timing = partData(message, "data-agent-timing");
  if (timing) {
    if (session.requestStartedAt > 0) {
      timing.clientDurationMs = Math.max(0, Date.now() - session.requestStartedAt);
    }
    updateChenSqlAiTiming(session, timing);
  }
  const runtimeError = partData(message, "data-error");
  if (runtimeError) {
    session.errorCode = String(runtimeError.code || "failed");
    session.errorText = String(runtimeError.message || "SQL AI failed");
  }
  if (!transports.get(session)?.receive(message)) {
    session.chat.messages.value = [...session.chat.messages.value, message];
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
    const value = Number(data[key]);
    if (Number.isFinite(value) && value >= 0) next[key] = value;
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

function isChenSqlAiChatMessage(message: unknown): message is ChenSqlAiChatMessage {
  if (!message || typeof message !== "object") return false;
  const value = message as Record<string, unknown>;
  if (typeof value.id !== "string" || value.role !== "assistant" || !Array.isArray(value.parts)) return false;
  return value.parts.every((part) => {
    if (!part || typeof part !== "object") return false;
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text") return typeof candidate.text === "string";
    return typeof candidate.type === "string" && candidate.type.startsWith("data-") && "data" in candidate;
  });
}

export function createChenSqlAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
