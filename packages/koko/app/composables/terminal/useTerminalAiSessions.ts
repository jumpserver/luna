import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import { buildJSONEnvelope, ENVELOPE_CHAT } from "#koko/composables/terminal/envelope";

export type TerminalAiEventData = Record<string, any>;
export type TerminalAiChatMessage = UIMessage<TerminalAiEventData, Record<string, TerminalAiEventData>>;

export interface KokoTerminalAiSession {
  paneId: string;
  socket: WebSocket | null;
  terminalId: string;
  chat: UseChatHelpers<TerminalAiChatMessage>;
  enabled: boolean;
  backgroundExec: boolean;
  backgroundReason: string;
  approvalThreshold: number;
  executionMode: string;
  inputLocked: boolean;
  draft: string;
  runtimeStatus: string;
  errorText: string;
  decisions: Set<string>;
  executionOverrides: Map<string, string>;
  expansionOverrides: Map<string, boolean>;
}

interface ActiveChatResponse {
  controller: ReadableStreamDefaultController<UIMessageChunk>;
  started: boolean;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

class KokoTerminalAiChatTransport implements ChatTransport<TerminalAiChatMessage> {
  private activeResponse: ActiveChatResponse | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly terminalId: () => string,
    private readonly enabled: () => boolean
  ) {}

  sendMessages: ChatTransport<TerminalAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    if (this.activeResponse) throw new Error("A Terminal AI response is already active");
    if (!this.enabled() || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Terminal AI is not available for the active terminal");
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") throw new Error("Terminal AI requires a user message");

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

    try {
      this.socket.send(
        buildJSONEnvelope(ENVELOPE_CHAT, {
          ...message,
          metadata: {
            ...message.metadata,
            terminalId: Number(this.terminalId())
          }
        })
      );
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error("Failed to send Terminal AI message"));
      throw error;
    }

    return stream;
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
    this.finish();
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
          session.errorText = error.message;
        }
      })
    )!
  );

  session = reactive({
    paneId,
    socket: markRaw(socket),
    terminalId,
    chat,
    enabled: false,
    backgroundExec: false,
    backgroundReason: "",
    approvalThreshold: 2,
    executionMode: "auto",
    inputLocked: false,
    draft: "",
    runtimeStatus: "",
    errorText: "",
    decisions: new Set<string>(),
    executionOverrides: new Map<string, string>(),
    expansionOverrides: new Map<string, boolean>()
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

export function getKokoTerminalAiSession(paneId: string) {
  return sessions.get(paneId) || null;
}

export function isKokoTerminalAiInputLocked(paneId: string) {
  return Boolean(sessions.get(paneId)?.inputLocked);
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
    session.approvalThreshold = Number(capability.approvalThreshold) || 2;
    session.executionMode = String(capability.executionMode || "auto");
    return;
  }

  const inputLock = partData(message, "data-input-lock");
  if (inputLock) {
    session.inputLocked = Boolean(inputLock.locked);
    return;
  }

  const progress = partData(message, "data-progress");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    if (String(progress.state || "") === "idle") transports.get(session)?.finish();
    return;
  }

  const policy = partData(message, "data-policy");
  if (policy) {
    session.approvalThreshold = Number(policy.approvalThreshold) || session.approvalThreshold;
    session.executionMode = String(policy.executionMode || session.executionMode);
    return;
  }

  const runtimeError = partData(message, "data-error");
  if (runtimeError) session.errorText = String(runtimeError.message || "Terminal AI failed");

  if (!transports.get(session)?.receive(message)) {
    session.chat.messages.value = [...session.chat.messages.value, message];
  }
}

export function sendKokoTerminalAiControl(paneId: string, message: TerminalAiChatMessage) {
  const session = sessions.get(paneId);
  const socket = session?.socket;
  if (!session?.enabled || !socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Terminal AI is not available for the active terminal");
  }

  socket.send(buildJSONEnvelope(ENVELOPE_CHAT, message));
}

export function createTerminalAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
