import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import type { AgentApprovalMode, KokoMcpCancelFrame, KokoMcpRequestFrame } from "../agent/types";
import type { AgentSessionController } from "../agent/useAgentSession";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import { buildJSONEnvelope, ENVELOPE_TERMINAL_COMMAND } from "#koko/composables/terminal/envelope";
import { agentChatTextId, closeAgentChatText } from "../agent/agentChatStream";
import { AgentToolRelay } from "../agent/agentToolRelay";
import { isRecord, kokoMcpWireMessage, manifestFromFrame, parseKokoMcpFrame } from "../agent/types";
import { useAgentSession } from "../agent/useAgentSession";

export type TerminalAiEventData = Record<string, any>;
export type TerminalAiChatMessage = UIMessage<TerminalAiEventData, Record<string, TerminalAiEventData>>;
export type KokoTerminalAiMetadataApprovalDecision = "approve_once" | "approve_session" | "reject";

export interface KokoTerminalAiSessionOptions {
  sendMcpFrame?: (frame: KokoMcpRequestFrame | KokoMcpCancelFrame) => void;
}

function terminalExecutionMode(value: unknown) {
  const mode = String(value || "auto").toLowerCase();
  if (mode === "pty") return "pty";
  if (mode === "background" || mode === "background_exec") return "background";
  return "auto";
}

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
  agent: AgentSessionController;
  chat: UseChatHelpers<TerminalAiChatMessage>;
  connected: boolean;
  enabled: boolean;
  sessionInfoReady: boolean;
  backgroundExec: boolean;
  backgroundReason: string;
  backgroundReasonCode: string;
  approvalThreshold: number;
  approvalMode: AgentApprovalMode;
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
  openTextIds: Set<string>;
  abortSignal?: AbortSignal;
  abortHandler?: () => void;
}

interface PendingChatDispatch {
  resolve: () => void;
  reject: (error: Error) => void;
}

class KokoTerminalAiChatTransport implements ChatTransport<TerminalAiChatMessage> {
  private readonly activeResponses: ActiveChatResponse[] = [];
  private readonly pendingDispatches: PendingChatDispatch[] = [];

  constructor(private readonly getSession: () => KokoTerminalAiSession) {}

  sendMessages: ChatTransport<TerminalAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    const dispatch = this.pendingDispatches.shift();
    const session = this.getSession();
    if (!session.enabled || !session.agent.state.available || session.socket?.readyState !== WebSocket.OPEN) {
      const failure = clientError("unavailable", "Terminal AI is not available for the active terminal");
      dispatch?.reject(failure);
      throw failure;
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") {
      const failure = clientError("invalid_message", "Terminal AI requires a user message");
      dispatch?.reject(failure);
      throw failure;
    }

    let response: ActiveChatResponse | null = null;
    try {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const stream = new ReadableStream<UIMessageChunk>({
        start: (streamController) => {
          controller = streamController;
        },
        cancel: () => {
          if (response) this.clearActiveResponse(response);
        }
      });
      response = { controller, started: false, openTextIds: new Set(), abortSignal };
      this.activeResponses.push(response);
      const abortHandler = () => this.finish(response!);
      if (abortSignal) {
        response.abortHandler = abortHandler;
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      if (abortSignal?.aborted) throw new DOMException("Terminal AI request was aborted", "AbortError");
      if (!session.enabled || !session.agent.state.available || session.socket?.readyState !== WebSocket.OPEN) {
        throw clientError("unavailable", "Terminal AI is not available for the active terminal");
      }
      session.taskActive = true;
      await session.agent.actions.sendMessage({
        ...message,
        metadata: {
          ...message.metadata,
          domain: "terminal",
          terminalId: Number(session.terminalId),
          execution_mode: terminalExecutionMode(session.executionMode)
        }
      });
      dispatch?.resolve();
      return stream;
    } catch (error) {
      const failure =
        error instanceof TerminalAiClientError
          ? error
          : clientError("send_failed", error instanceof Error ? error.message : "Failed to send Terminal AI message");
      dispatch?.reject(failure);
      if (response) this.fail(response, failure);
      throw failure;
    }
  };

  reconnectToStream: ChatTransport<TerminalAiChatMessage>["reconnectToStream"] = async () => null;

  receive(message: TerminalAiChatMessage) {
    const response = this.activeResponses[0];
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
      if (part.type === "text") {
        const isDelta = message.metadata?.agentEventType === "message.delta";
        const id = agentChatTextId(response, message.id, index);
        if (!response.openTextIds.has(id)) {
          response.controller.enqueue({ type: "text-start", id });
          response.openTextIds.add(id);
        }
        response.controller.enqueue({ type: "text-delta", id, delta: part.text });
        if (!isDelta) {
          response.controller.enqueue({ type: "text-end", id });
          response.openTextIds.delete(id);
        }
        continue;
      }

      if (!part.type.startsWith("data-") || !("data" in part)) continue;
      closeAgentChatText(response);
      const id = `${message.id}-${index}`;
      if (part.type === "data-error") {
        const data = part.data as TerminalAiEventData;
        response.controller.enqueue({
          type: "error",
          errorText: String(data.message || "Terminal AI failed")
        });
        response.controller.close();
        this.clearActiveResponse(response);
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

  finish(response = this.activeResponses[0]) {
    if (!response) return;
    closeAgentChatText(response);
    if (response.started) response.controller.enqueue({ type: "finish", finishReason: "stop" });
    response.controller.close();
    this.clearActiveResponse(response);
  }

  disconnect() {
    const error = clientError("unavailable", "Terminal AI session disconnected");
    for (const dispatch of this.pendingDispatches.splice(0)) dispatch.reject(error);
    for (const response of [...this.activeResponses]) this.finish(response);
  }

  waitForNextDispatch() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    this.pendingDispatches.push({ resolve, reject });
    return promise;
  }

  cancelPendingDispatch(error: Error) {
    this.pendingDispatches.shift()?.reject(error);
  }

  private fail(response: ActiveChatResponse, error: Error) {
    response.controller.error(error);
    this.clearActiveResponse(response);
  }

  private clearActiveResponse(response: ActiveChatResponse) {
    if (response.abortSignal && response.abortHandler) {
      response.abortSignal.removeEventListener("abort", response.abortHandler);
    }
    response.openTextIds.clear();
    const index = this.activeResponses.indexOf(response);
    if (index < 0) return;
    this.activeResponses.splice(index, 1);
  }
}

const sessions = shallowReactive(new Map<string, KokoTerminalAiSession>());
const activeTargetIds = shallowReactive(new Map<string, string>());
const transports = new WeakMap<KokoTerminalAiSession, KokoTerminalAiChatTransport>();
const chatScopes = new WeakMap<KokoTerminalAiSession, EffectScope>();
const mcpFrameSenders = new WeakMap<KokoTerminalAiSession, NonNullable<KokoTerminalAiSessionOptions["sendMcpFrame"]>>();

function resolvedTerminalAiTargetId(paneId: string) {
  return activeTargetIds.get(paneId) || paneId;
}

function resolveTerminalAiSession(paneId: string) {
  return sessions.get(resolvedTerminalAiTargetId(paneId));
}

function removeTerminalAiTargetAliases(targetId: string) {
  for (const [paneId, activeTargetId] of activeTargetIds) {
    if (activeTargetId === targetId) activeTargetIds.delete(paneId);
  }
}

function createSession(paneId: string, socket: WebSocket, terminalId: string): KokoTerminalAiSession {
  let session: KokoTerminalAiSession;
  const transport = markRaw(new KokoTerminalAiChatTransport(() => session));
  const relay = markRaw(
    new AgentToolRelay({
      resourceSessionId: () => session?.agent.state.resourceSessionId || "",
      revision: () => session?.agent.state.revision || 1,
      transformToolArguments: (toolCallId, toolName, argumentsValue) => {
        if (!toolName.startsWith("execute_") || !isRecord(argumentsValue)) return argumentsValue;
        const execution = terminalExecutionMode(session?.executionOverrides.get(toolCallId) || session?.executionMode);
        return execution === "auto" ? argumentsValue : { ...argumentsValue, execution };
      },
      sendFrame: (frame) => {
        const target = session?.socket;
        if (!target || target.readyState !== WebSocket.OPEN) throw new Error("Terminal MCP relay is disconnected");
        const sendMcpFrame = mcpFrameSenders.get(session);
        if (sendMcpFrame) {
          sendMcpFrame(frame);
          return;
        }
        target.send(
          buildJSONEnvelope(ENVELOPE_TERMINAL_COMMAND, {
            terminalId: Number(session.terminalId),
            command: frame.type,
            params: kokoMcpWireMessage(frame)
          })
        );
      }
    })
  );
  const agent = markRaw(
    useAgentSession({
      domain: "terminal",
      relay,
      messageMetadata: () => ({ domain: "terminal", terminalId: Number(session?.terminalId) || 0 }),
      onMessage: (message) => handleKokoTerminalAiMessage(paneId, message),
      onAvailability: (available) => {
        if (session) session.enabled = available;
      },
      onApprovalMode: (mode) => {
        if (session) session.approvalMode = mode;
      },
      onInputLock: (locked) => {
        if (session) session.inputLocked = locked;
      },
      onHistoryReset: () => {
        if (!session) return;
        session.chat.messages.value = [];
        session.taskActive = false;
        session.inputLocked = false;
        session.metadataApproval = null;
        session.pendingApprovals.clear();
        session.decisions.clear();
        session.executionOverrides.clear();
        session.expansionOverrides.clear();
        session.runtimeStatus = "";
        session.runtimeStatusCode = "";
        session.runtimeState = "";
        session.runtimeExecution = "";
        session.errorCode = "";
        session.errorText = "";
      },
      onUnavailable: (error) => {
        if (!session) return;
        session.errorCode = "agent_unavailable";
        session.errorText = error.message;
        session.taskActive = false;
        transport.disconnect();
      }
    })
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
    agent,
    chat,
    connected: socket.readyState === WebSocket.OPEN,
    enabled: false,
    sessionInfoReady: false,
    backgroundExec: false,
    backgroundReason: "",
    backgroundReasonCode: "",
    approvalThreshold: 2,
    approvalMode: "auto",
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
      const agentDecision = decision === "reject" ? "reject" : "approve";
      void session.agent.actions.resolveApproval(approval.approvalId, agentDecision).catch((error) => {
        approval.resolving = false;
        session.errorCode = "metadata_approval_failed";
        session.errorText = error instanceof Error ? error.message : "Failed to send metadata approval";
      });
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

export function registerKokoTerminalAiSession(
  paneId: string,
  socket: WebSocket,
  terminalId: string,
  options: KokoTerminalAiSessionOptions = {}
) {
  if (!paneId) return null;

  const existing = sessions.get(paneId);
  if (existing?.socket === socket) {
    if (terminalId) existing.terminalId = terminalId;
    if (options.sendMcpFrame) mcpFrameSenders.set(existing, options.sendMcpFrame);
    return existing;
  }
  if (existing) {
    existing.agent.actions.dispose();
    transports.get(existing)?.disconnect();
    chatScopes.get(existing)?.stop();
    mcpFrameSenders.delete(existing);
  }

  const session = createSession(paneId, socket, terminalId);
  if (options.sendMcpFrame) mcpFrameSenders.set(session, options.sendMcpFrame);
  sessions.set(paneId, session);
  return session;
}

export function unregisterKokoTerminalAiSession(paneId: string, socket?: WebSocket | null) {
  const session = sessions.get(paneId);
  if (!session || (socket && session.socket !== socket)) return;
  transports.get(session)?.disconnect();
  session.agent.actions.dispose();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  mcpFrameSenders.delete(session);
  sessions.delete(paneId);
  removeTerminalAiTargetAliases(paneId);
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
  session.sessionInfoReady = false;
  session.inputLocked = false;
  session.taskActive = false;
  session.metadataApproval = null;
  session.pendingApprovals.clear();
  session.agent.actions.dispose();
  transports.get(session)?.disconnect();
}

export function getKokoTerminalAiSession(paneId: string) {
  return resolveTerminalAiSession(paneId) || null;
}

export function setActiveKokoTerminalAiTarget(paneId: string, targetId: string | null) {
  if (!paneId) return;
  if (targetId) activeTargetIds.set(paneId, targetId);
  else activeTargetIds.delete(paneId);
}

export function isKokoTerminalAiInputLocked(paneId: string) {
  return Boolean(resolveTerminalAiSession(paneId)?.inputLocked);
}

export function isKokoTerminalAiAvailable(paneId: string) {
  const session = resolveTerminalAiSession(paneId);
  return Boolean(
    session?.connected &&
    session.enabled &&
    session.agent.state.available &&
    session.socket?.readyState === WebSocket.OPEN
  );
}

export function isKokoTerminalAiSessionInfoReady(paneId: string) {
  return Boolean(resolveTerminalAiSession(paneId)?.sessionInfoReady);
}

export function markKokoTerminalAiSessionInfoReady(paneId: string) {
  const session = resolveTerminalAiSession(paneId);
  if (!session) return;
  session.sessionInfoReady = true;
}

export function isKokoTerminalAiWaitingForApproval(paneId: string) {
  const session = resolveTerminalAiSession(paneId);
  return Boolean(session?.metadataApproval || session?.pendingApprovals.size);
}

export function isKokoTerminalAiBusy(paneId: string) {
  const session = resolveTerminalAiSession(paneId);
  return Boolean(session?.inputLocked || session?.metadataApproval || session?.pendingApprovals.size);
}

export async function submitKokoTerminalAiPrompt(paneId: string, text: string): Promise<void> {
  const session = resolveTerminalAiSession(paneId);
  const socket = session?.socket;
  if (!session?.connected || !session.enabled || !socket || socket.readyState !== WebSocket.OPEN) {
    throw clientError("unavailable", "Terminal AI is not available for the active terminal");
  }

  const prompt = text.trim();
  if (!prompt) throw clientError("invalid_message", "Terminal AI requires a user message");
  if (session.inputLocked || session.metadataApproval || session.pendingApprovals.size) {
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
      metadata: {
        domain: "terminal",
        terminalId: Number(session.terminalId),
        execution_mode: terminalExecutionMode(session.executionMode)
      }
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

export function handleKokoTerminalAiWireMessage(paneId: string, message: unknown) {
  const frame = parseKokoMcpFrame(message);
  if (!frame) return false;
  const session = sessions.get(paneId);
  if (!session) return true;
  if (frame.type === "mcp.manifest") {
    const commandTool = frame.data.tools.find(
      (tool) => tool._meta?.["com.jumpserver/toolKind"] === "command" || tool.name === "execute_command"
    );
    const executionModes = commandTool?._meta?.["com.jumpserver/executionModes"];
    session.backgroundExec = Array.isArray(executionModes) && executionModes.includes("background");
    if (!session.backgroundExec && session.executionMode === "background") session.executionMode = "auto";
    void session.agent.actions.attachManifest(manifestFromFrame(frame)).catch((error) => {
      session.errorCode = "agent_unavailable";
      session.errorText = error instanceof Error ? error.message : "Failed to create Agent session";
    });
    return true;
  }
  void session.agent.actions.receiveKokoFrame(frame).catch((error) => {
    session.errorCode = "tool_result_failed";
    session.errorText = error instanceof Error ? error.message : "Failed to deliver MCP result";
  });
  return true;
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
    if (capability.backgroundExec !== undefined) session.backgroundExec = Boolean(capability.backgroundExec);
    session.backgroundReason = String(capability.backgroundReason || "");
    session.backgroundReasonCode = String(capability.backgroundReasonCode || capability.reasonCode || "");
    session.approvalThreshold = Number(capability.approvalThreshold) || 2;
    if (capability.executionMode !== undefined) {
      session.executionMode = terminalExecutionMode(capability.executionMode);
    }
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
    if (!message.parts.some((part) => part.type === "data-agent-tool" || part.type === "data-execution")) return;
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
    if (approvalId && terminalApproval.resolved) session.pendingApprovals.delete(approvalId);
    else if (approvalId) session.pendingApprovals.add(approvalId);
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
    if (["idle", "completed", "failed", "cancelled", "interrupted"].includes(session.runtimeState)) {
      session.taskActive = false;
      session.inputLocked = false;
      session.metadataApproval = null;
      session.pendingApprovals.clear();
      transports.get(session)?.finish();
    } else if (session.runtimeState) {
      session.taskActive = true;
    }
    const timelineParts = message.parts.filter(
      (part) => part.type !== "data-progress" && part.type !== "data-input-lock"
    );
    if (timelineParts.length) {
      const timelineMessage = { ...message, parts: timelineParts } as TerminalAiChatMessage;
      if (!transports.get(session)?.receive(timelineMessage)) {
        session.chat.messages.value = [...session.chat.messages.value, timelineMessage];
      }
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
  const session = resolveTerminalAiSession(paneId);
  const socket = session?.socket;
  if (
    !session?.connected ||
    !session.enabled ||
    !session.agent.state.available ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    throw clientError("unavailable", "Terminal AI is not available for the active terminal");
  }

  let handled = false;
  for (const part of message.parts) {
    if (!("data" in part)) continue;
    const data = part.data as TerminalAiEventData;
    if (part.type === "data-policy") {
      const mode = String(data.approvalMode || "");
      if (mode === "always" || mode === "auto" || mode === "never") {
        void session.agent.actions.setApprovalMode(mode).catch((error) => {
          session.errorCode = "policy_failed";
          session.errorText = error instanceof Error ? error.message : "Failed to update approval mode";
        });
      }
      session.executionMode = terminalExecutionMode(data.executionMode || session.executionMode);
      handled = true;
    }
    if (part.type === "data-approval" || part.type === "data-metadata-approval") {
      const approvalId = String(data.id || "");
      const decision = data.decision === "reject" || data.approved === false ? "reject" : "approve";
      if (approvalId) {
        handled = true;
        void session.agent.actions
          .resolveApproval(approvalId, decision)
          .then(() => session.pendingApprovals.delete(approvalId))
          .catch((error) => {
            session.decisions.delete(approvalId);
            session.errorCode = "approval_failed";
            session.errorText = error instanceof Error ? error.message : "Failed to submit approval";
          });
      }
    }
    if (part.type === "data-interrupt") {
      handled = true;
      void session.agent.actions.cancel().catch((error) => {
        session.errorCode = "interrupt_failed";
        session.errorText = error instanceof Error ? error.message : "Failed to cancel Agent run";
      });
      session.chat.stop();
    }
  }
  if (!handled) {
    void session.agent.actions.sendMessage(message).catch((error) => {
      session.errorCode = "send_failed";
      session.errorText = error instanceof Error ? error.message : "Failed to send Agent control message";
    });
  }
}

export function createTerminalAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
