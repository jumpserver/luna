import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import { buildJSONEnvelope, ENVELOPE_CHAT } from "#koko/composables/terminal/envelope";

export type TerminalAiEventData = Record<string, any>;
export type TerminalAiChatMessage = UIMessage<TerminalAiEventData, Record<string, TerminalAiEventData>>;
export type KokoTerminalAiMetadataApprovalDecision = "approve_once" | "approve_session" | "reject";

export interface KokoTerminalAiMetadataApproval {
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
  digest: string;
}

export interface KokoTerminalAiSession {
  kind: "terminal";
  paneId: string;
  socket: WebSocket | null;
  terminalId: string;
  chat: UseChatHelpers<TerminalAiChatMessage>;
  connected: boolean;
  enabled: boolean;
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
  errorCode: string;
  errorText: string;
  metadataApproval: KokoTerminalAiMetadataApproval | null;
  pendingApprovals: Set<string>;
  decisions: Set<string>;
  executionOverrides: Map<string, string>;
  expansionOverrides: Map<string, boolean>;
  resolveMetadataApproval: (decision: KokoTerminalAiMetadataApprovalDecision) => void;
}

class TerminalAiClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TerminalAiClientError";
  }
}

function clientError(code: string, message: string) {
  return new TerminalAiClientError(code, message);
}

interface ActiveChatResponse {
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  started: boolean;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

interface PendingChatDispatch {
  resolve: () => void;
  reject: (error: Error) => void;
}

class KokoTerminalAiChatTransport implements ChatTransport<TerminalAiChatMessage> {
  private activeResponse: ActiveChatResponse | null = null;
  private pendingDispatch: PendingChatDispatch | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly terminalId: () => string,
    private readonly enabled: () => boolean
  ) {}

  sendMessages: ChatTransport<TerminalAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    if (this.activeResponse) {
      const failure = clientError("response_active", "A Terminal AI response is already active");
      this.rejectPendingDispatch(failure);
      throw failure;
    }
    if (!this.enabled() || this.socket.readyState !== WebSocket.OPEN) {
      const failure = clientError("unavailable", "Terminal AI is not available for the active terminal");
      this.rejectPendingDispatch(failure);
      throw failure;
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") {
      const failure = clientError("invalid_message", "Terminal AI requires a user message");
      this.rejectPendingDispatch(failure);
      throw failure;
    }

    try {
      const stream = new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          this.activeResponse = { controller, started: false, abortSignal };
        },
        cancel: () => this.clearActiveResponse()
      });

      const abortHandler = () => this.finish();
      if (abortSignal) {
        this.activeResponse!.abortHandler = abortHandler;
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      this.socket.send(
        buildJSONEnvelope(ENVELOPE_CHAT, {
          ...message,
          metadata: {
            ...message.metadata,
            terminalId: Number(this.terminalId())
          }
        })
      );
      this.resolvePendingDispatch();
      return stream;
    } catch (error) {
      const failure =
        error instanceof TerminalAiClientError
          ? error
          : clientError("send_failed", error instanceof Error ? error.message : "Failed to send Terminal AI message");
      this.rejectPendingDispatch(failure);
      this.fail(failure);
      throw failure;
    }
  };

  reconnectToStream: ChatTransport<TerminalAiChatMessage>["reconnectToStream"] = async () => null;

  receive(message: TerminalAiChatMessage) {
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
      response.controller.enqueue({
        type: "message-metadata",
        messageMetadata: message.metadata
      });
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
        const data = part.data as TerminalAiEventData;
        response.controller.enqueue({
          type: "error",
          errorText: String(data.message || "Terminal AI failed")
        });
        response.controller.close();
        this.clearActiveResponse();
        return true;
      }

      response.controller.enqueue({
        type: part.type,
        id,
        data: part.data
      });
    }

    return true;
  }

  finish() {
    const response = this.activeResponse;
    if (!response) return;
    if (response.started) response.controller.enqueue({ type: "finish", finishReason: "stop" });
    response.controller.close();
    this.clearActiveResponse();
  }

  disconnect() {
    this.rejectPendingDispatch(clientError("unavailable", "Terminal AI session disconnected"));
    this.finish();
  }

  waitForNextDispatch() {
    if (this.pendingDispatch) {
      throw clientError("response_active", "A Terminal AI dispatch is already pending");
    }

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    this.pendingDispatch = { resolve, reject };
    return promise;
  }

  cancelPendingDispatch(error: Error) {
    this.rejectPendingDispatch(error);
  }

  private fail(error: Error) {
    const response = this.activeResponse;
    if (!response) return;
    response.controller.error(error);
    this.clearActiveResponse();
  }

  private clearActiveResponse() {
    const response = this.activeResponse;
    if (response?.abortSignal && response.abortHandler) {
      response.abortSignal.removeEventListener("abort", response.abortHandler);
    }
    this.activeResponse = null;
  }

  private resolvePendingDispatch() {
    const dispatch = this.pendingDispatch;
    this.pendingDispatch = null;
    dispatch?.resolve();
  }

  private rejectPendingDispatch(error: Error) {
    const dispatch = this.pendingDispatch;
    this.pendingDispatch = null;
    dispatch?.reject(error);
  }
}

const sessions = shallowReactive(new Map<string, KokoTerminalAiSession>());
const transports = new WeakMap<KokoTerminalAiSession, KokoTerminalAiChatTransport>();
const chatScopes = new WeakMap<KokoTerminalAiSession, EffectScope>();

function createSession(paneId: string, socket: WebSocket, terminalId: string): KokoTerminalAiSession {
  let session: KokoTerminalAiSession;
  const transport = markRaw(
    new KokoTerminalAiChatTransport(
      socket,
      () => session.terminalId,
      () => session.enabled
    )
  );
  const chatScope = effectScope(true);
  const chat = markRaw(
    chatScope.run(() =>
      useChat<TerminalAiChatMessage>({
        id: paneId,
        transport,
        generateId: () => createTerminalAiMessageId("message"),
        onError: (error) => {
          if (error instanceof TerminalAiClientError) {
            session.errorCode = error.code;
            session.errorText = "";
          } else if (!session.errorCode) {
            session.errorText = error.message;
          }
        }
      })
    )!
  );

  session = reactive({
    kind: "terminal",
    paneId,
    socket: markRaw(socket),
    terminalId,
    chat,
    connected: socket.readyState === WebSocket.OPEN,
    enabled: false,
    backgroundExec: false,
    backgroundReason: "",
    backgroundReasonCode: "",
    approvalThreshold: 2,
    executionMode: "auto",
    inputLocked: false,
    taskActive: false,
    draft: "",
    runtimeStatus: "",
    runtimeStatusCode: "",
    runtimeState: "",
    runtimeExecution: "",
    errorCode: "",
    errorText: "",
    metadataApproval: null,
    pendingApprovals: new Set<string>(),
    decisions: new Set<string>(),
    executionOverrides: new Map<string, string>(),
    expansionOverrides: new Map<string, boolean>(),
    resolveMetadataApproval: (decision: KokoTerminalAiMetadataApprovalDecision) => {
      const approval = session.metadataApproval;
      if (!approval || approval.resolving) return;
      approval.resolving = true;
      try {
        sendKokoTerminalAiControl(paneId, {
          id: createTerminalAiMessageId("metadata-approval"),
          role: "user",
          metadata: { terminalId: Number(session.terminalId) },
          parts: [
            {
              type: "data-metadata-approval",
              data: {
                id: approval.approvalId,
                digest: approval.digest,
                decision
              }
            }
          ]
        });
      } catch (error) {
        approval.resolving = false;
        session.errorCode = "metadata_approval_failed";
        session.errorText = error instanceof Error ? error.message : "Failed to send metadata approval";
      }
    }
  }) as KokoTerminalAiSession;
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  return session;
}

function partData(message: TerminalAiChatMessage, type: string) {
  const part = message.parts.find((candidate) => candidate.type === type);
  return part && "data" in part ? (part.data as TerminalAiEventData) : undefined;
}

function isTerminalAiChatMessage(message: unknown): message is TerminalAiChatMessage {
  if (!message || typeof message !== "object") return false;
  const value = message as Record<string, unknown>;
  if (typeof value.id !== "string" || (value.role !== "user" && value.role !== "assistant")) return false;
  if (value.metadata !== undefined && (!value.metadata || typeof value.metadata !== "object")) return false;
  if (!Array.isArray(value.parts)) return false;

  return value.parts.every((part) => {
    if (!part || typeof part !== "object") return false;
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text") return typeof candidate.text === "string";
    return typeof candidate.type === "string" && candidate.type.startsWith("data-") && "data" in candidate;
  });
}

export function registerKokoTerminalAiSession(paneId: string, socket: WebSocket, terminalId: string) {
  if (!paneId) return null;

  const existing = sessions.get(paneId);
  if (existing?.socket === socket) {
    if (terminalId) existing.terminalId = terminalId;
    return existing;
  }
  if (existing) {
    transports.get(existing)?.disconnect();
    chatScopes.get(existing)?.stop();
  }

  const session = createSession(paneId, socket, terminalId);
  sessions.set(paneId, session);
  return session;
}

export function unregisterKokoTerminalAiSession(paneId: string, socket?: WebSocket | null) {
  const session = sessions.get(paneId);
  if (!session || (socket && session.socket !== socket)) return;
  transports.get(session)?.disconnect();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(paneId);
}

export function connectKokoTerminalAiSession(paneId: string, socket: WebSocket) {
  const session = sessions.get(paneId);
  if (!session || session.socket !== socket) return;
  session.connected = true;
}

export function disconnectKokoTerminalAiSession(paneId: string, socket?: WebSocket | null) {
  const session = sessions.get(paneId);
  if (!session || (socket && session.socket !== socket)) return;

  session.connected = false;
  session.enabled = false;
  session.inputLocked = false;
  session.taskActive = false;
  session.metadataApproval = null;
  session.pendingApprovals.clear();
  transports.get(session)?.disconnect();
}

export function getKokoTerminalAiSession(paneId: string) {
  return sessions.get(paneId) || null;
}

export function isKokoTerminalAiInputLocked(paneId: string) {
  return Boolean(sessions.get(paneId)?.inputLocked);
}

export function isKokoTerminalAiAvailable(paneId: string) {
  const session = sessions.get(paneId);
  return Boolean(session?.connected && session.enabled && session.socket?.readyState === WebSocket.OPEN);
}

export function isKokoTerminalAiWaitingForApproval(paneId: string) {
  const session = sessions.get(paneId);
  return Boolean(session?.metadataApproval || session?.pendingApprovals.size);
}

export function isKokoTerminalAiBusy(paneId: string) {
  const session = sessions.get(paneId);
  return Boolean(
    session?.taskActive || session?.inputLocked || session?.metadataApproval || session?.pendingApprovals.size
  );
}

export async function submitKokoTerminalAiPrompt(paneId: string, text: string): Promise<void> {
  const session = sessions.get(paneId);
  const socket = session?.socket;
  if (!session?.connected || !session.enabled || !socket || socket.readyState !== WebSocket.OPEN) {
    throw clientError("unavailable", "Terminal AI is not available for the active terminal");
  }

  const prompt = text.trim();
  if (!prompt) throw clientError("invalid_message", "Terminal AI requires a user message");
  if (isKokoTerminalAiBusy(paneId)) {
    throw clientError("response_active", "A Terminal AI response is already active");
  }

  const transport = transports.get(session);
  if (!transport) throw clientError("unavailable", "Terminal AI is not available for the active terminal");

  session.errorCode = "";
  session.errorText = "";
  session.chat.clearError();

  session.taskActive = true;
  try {
    const dispatched = transport.waitForNextDispatch();
    const response = session.chat.sendMessage({
      text: prompt,
      metadata: { terminalId: Number(session.terminalId) }
    });
    void response.catch(() => {
      session.taskActive = false;
      if (!session.errorCode && !session.errorText) session.errorCode = "send_failed";
    });
    await dispatched;
  } catch (error) {
    session.taskActive = false;
    const failure = error instanceof Error ? error : clientError("send_failed", "Failed to send Terminal AI message");
    transport.cancelPendingDispatch(failure);
    if (failure instanceof TerminalAiClientError) {
      session.errorCode = failure.code;
      session.errorText = "";
    } else {
      session.errorCode = "send_failed";
      session.errorText = failure.message;
    }
    throw failure;
  }
}

export function handleKokoTerminalAiMessage(paneId: string, message: unknown) {
  const session = sessions.get(paneId);
  if (!session || !isTerminalAiChatMessage(message)) return;

  const messageTerminalId = Number(message.metadata?.terminalId) || 0;
  if (messageTerminalId && session.terminalId && messageTerminalId !== Number(session.terminalId)) return;
  if (messageTerminalId && !session.terminalId) session.terminalId = String(messageTerminalId);

  const capability = partData(message, "data-capability");
  if (capability) {
    session.enabled = Boolean(capability.enabled);
    session.backgroundExec = Boolean(capability.backgroundExec);
    session.backgroundReason = String(capability.backgroundReason || "");
    session.backgroundReasonCode = String(capability.backgroundReasonCode || capability.reasonCode || "");
    session.approvalThreshold = Number(capability.approvalThreshold) || 2;
    session.executionMode = String(capability.executionMode || "auto");
    if (!session.enabled) {
      session.inputLocked = false;
      session.taskActive = false;
      session.metadataApproval = null;
      session.pendingApprovals.clear();
      transports.get(session)?.finish();
    }
    return;
  }

  const inputLock = partData(message, "data-input-lock");
  if (inputLock) {
    session.inputLocked = Boolean(inputLock.locked);
    return;
  }

  const metadataApproval = partData(message, "data-metadata-approval");
  if (metadataApproval) {
    session.metadataApproval = {
      approvalId: String(metadataApproval.id || ""),
      requestId: "",
      toolCallId: "",
      provider: "",
      model: "",
      database: String(metadataApproval.database || ""),
      schema: "",
      tables: Array.isArray(metadataApproval.tables) ? metadataApproval.tables.map(String) : [],
      query: String(metadataApproval.query || ""),
      discovery: false,
      maxMatches: Number(metadataApproval.maxMatches) || 20,
      followUpTableLimit: Number(metadataApproval.tableLimit) || 5,
      dataCategories: Array.isArray(metadataApproval.dataCategories) ? metadataApproval.dataCategories.map(String) : [],
      expandedScope: false,
      expiresInSeconds: Number(metadataApproval.expiresInSeconds) || 300,
      resolving: false,
      digest: String(metadataApproval.digest || "")
    };
    return;
  }

  const terminalApproval = partData(message, "data-approval");
  if (message.role === "assistant" && terminalApproval) {
    const approvalId = String(terminalApproval.id || "");
    if (approvalId) session.pendingApprovals.add(approvalId);
  }

  const metadataApprovalResolved = partData(message, "data-metadata-approval-resolved");
  if (metadataApprovalResolved) {
    if (session.metadataApproval?.approvalId === String(metadataApprovalResolved.id || "")) {
      session.metadataApproval = null;
    }
    return;
  }

  const progress = partData(message, "data-progress");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    session.runtimeStatusCode = String(progress.code || "");
    session.runtimeState = String(progress.state || "");
    session.runtimeExecution = String(progress.execution || "");
    if (session.runtimeState === "idle") {
      session.taskActive = false;
      session.inputLocked = false;
      session.metadataApproval = null;
      session.pendingApprovals.clear();
      transports.get(session)?.finish();
    } else if (session.runtimeState) {
      session.taskActive = true;
    }
    return;
  }

  const policy = partData(message, "data-policy");
  if (policy) {
    session.approvalThreshold = Number(policy.approvalThreshold) || session.approvalThreshold;
    session.executionMode = String(policy.executionMode || session.executionMode);
    return;
  }

  const runtimeError = partData(message, "data-error");
  if (runtimeError) {
    session.taskActive = false;
    session.inputLocked = false;
    session.metadataApproval = null;
    session.pendingApprovals.clear();
    session.errorCode = String(runtimeError.code || "");
    session.errorText = String(runtimeError.message || "Terminal AI failed");
    if (!session.errorCode && !runtimeError.message) session.errorCode = "failed";
  }

  if (!transports.get(session)?.receive(message)) {
    session.chat.messages.value = [...session.chat.messages.value, message];
  }
}

export function sendKokoTerminalAiControl(paneId: string, message: TerminalAiChatMessage) {
  const session = sessions.get(paneId);
  const socket = session?.socket;
  if (!session?.connected || !session.enabled || !socket || socket.readyState !== WebSocket.OPEN) {
    throw clientError("unavailable", "Terminal AI is not available for the active terminal");
  }

  socket.send(buildJSONEnvelope(ENVELOPE_CHAT, message));
  for (const part of message.parts) {
    if (part.type !== "data-approval" || !("data" in part)) continue;
    const approvalId = String((part.data as TerminalAiEventData).id || "");
    if (approvalId) session.pendingApprovals.delete(approvalId);
  }
  if (message.parts.some((part) => part.type === "data-interrupt")) session.chat.stop();
}

export function createTerminalAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
