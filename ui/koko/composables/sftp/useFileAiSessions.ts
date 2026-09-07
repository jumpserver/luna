import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import type { AgentApprovalMode } from "../agent/types";
import type { AgentSessionController } from "../agent/useAgentSession";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import {
  agentChatEventLifecycle,
  agentChatStreamMessage,
  agentChatTextId,
  closeAgentChatText
} from "../agent/agentChatStream";
import { AgentToolRelay } from "../agent/agentToolRelay";
import { kokoMcpWireMessage, manifestFromFrame, parseKokoMcpFrame } from "../agent/types";
import { useAgentSession } from "../agent/useAgentSession";
import { createSftpMessageId, joinSftpPath } from "./core/codec";

export type FileAiEventData = Record<string, unknown>;
export type FileAiChatMessage = UIMessage<FileAiEventData, Record<string, FileAiEventData>>;
export type KokoFileAiApprovalDecision = "approve" | "reject";

export interface KokoFileAiSelectedEntry {
  name: string;
  path: string;
  size: string;
  perm: string;
  modTime: string;
  type: string;
  isDirectory: boolean;
  version?: string;
}

export interface KokoFileAiContext {
  targetId: string;
  assetId: string;
  assetName: string;
  account?: string;
  currentPath: string;
  selectedEntries: KokoFileAiSelectedEntry[];
  connected: boolean;
}

export interface KokoFileAiTarget {
  targetId?: string;
  ownerId?: string;
  assetId: string;
  assetName: string;
  account?: string;
}

export interface KokoFileAiSession {
  kind: "file";
  targetId: string;
  socket: WebSocket | null;
  agent: AgentSessionController;
  chat: UseChatHelpers<FileAiChatMessage>;
  context: KokoFileAiContext;
  connected: boolean;
  enabled: boolean;
  capabilityKnown: boolean;
  approvalMode: AgentApprovalMode;
  taskActive: boolean;
  draft: string;
  runtimeStatus: string;
  runtimeStatusCode: string;
  runtimeState: string;
  errorCode: string;
  errorText: string;
  pendingApprovals: Set<string>;
  resolvingApprovals: Set<string>;
  approvalDigests: Map<string, string>;
}

class FileAiClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FileAiClientError";
  }
}

function clientError(code: string, message: string) {
  return new FileAiClientError(code, message);
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

class KokoFileAiChatTransport implements ChatTransport<FileAiChatMessage> {
  private readonly activeResponses: ActiveChatResponse[] = [];
  private readonly pendingDispatches: PendingChatDispatch[] = [];

  constructor(private readonly session: () => KokoFileAiSession) {}

  sendMessages: ChatTransport<FileAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    const dispatch = this.pendingDispatches.shift();
    const session = this.session();
    const socket = session.socket;
    if (
      !session.connected ||
      !session.enabled ||
      !session.agent.state.available ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      const failure = clientError("unavailable", "File AI is not available for the active file session");
      dispatch?.reject(failure);
      throw failure;
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") {
      const failure = clientError("invalid_message", "File AI requires a user message");
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

      if (abortSignal?.aborted) throw new DOMException("File AI request was aborted", "AbortError");
      if (
        !session.connected ||
        !session.enabled ||
        !session.agent.state.available ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        throw clientError("unavailable", "File AI is not available for the active file session");
      }
      session.taskActive = true;
      const chatMessage: FileAiChatMessage = {
        ...message,
        metadata: {
          ...message.metadata,
          domain: "file",
          targetId: session.targetId,
          context: session.context
        }
      };
      await session.agent.actions.sendMessage(chatMessage);
      dispatch?.resolve();
      return stream;
    } catch (error) {
      const failure =
        error instanceof FileAiClientError
          ? error
          : clientError("send_failed", error instanceof Error ? error.message : "Failed to send File AI message");
      dispatch?.reject(failure);
      if (response) this.fail(response, failure);
      throw failure;
    }
  };

  reconnectToStream: ChatTransport<FileAiChatMessage>["reconnectToStream"] = async () => null;

  receive(message: FileAiChatMessage) {
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
        response.controller.enqueue({
          type: "error",
          errorText: String((part.data as FileAiEventData).message || "File AI failed")
        });
        response.controller.close();
        this.clearActiveResponse(response);
        return true;
      }
      response.controller.enqueue({ type: part.type, id, data: part.data });
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
    const error = clientError("unavailable", "File AI session disconnected");
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

export const KOKO_GLOBAL_FILE_AI_OWNER_ID = "koko:file-workspace:global";
const defaultFileAiOwnerId = "koko:file-ai:default";
const sessions = shallowReactive(new Map<string, KokoFileAiSession>());
const activeTargetIds = shallowReactive(new Map<string, string>());
const ownerTargetIds = new Map<string, Set<string>>();
const targetOwnerIds = new Map<string, Set<string>>();
const transports = new WeakMap<KokoFileAiSession, KokoFileAiChatTransport>();
const chatScopes = new WeakMap<KokoFileAiSession, EffectScope>();
const pendingSessionReleases = new Map<string, symbol>();
const mutatingFileAiTools = new Set(["save_text", "mkdir", "rename", "delete"]);

function normalizedFileAiOwnerId(ownerId?: string) {
  return ownerId || defaultFileAiOwnerId;
}

function encodedFileAiIdentityPart(value: string) {
  return encodeURIComponent(value || "-");
}

function bindFileAiTargetOwner(ownerId: string, targetId: string) {
  const ownerTargets = ownerTargetIds.get(ownerId) || new Set<string>();
  ownerTargets.add(targetId);
  ownerTargetIds.set(ownerId, ownerTargets);

  const targetOwners = targetOwnerIds.get(targetId) || new Set<string>();
  targetOwners.add(ownerId);
  targetOwnerIds.set(targetId, targetOwners);
}

function removeFileAiTargetOwners(targetId: string) {
  for (const ownerId of targetOwnerIds.get(targetId) || []) {
    const ownerTargets = ownerTargetIds.get(ownerId);
    ownerTargets?.delete(targetId);
    if (!ownerTargets?.size) ownerTargetIds.delete(ownerId);
    if (activeTargetIds.get(ownerId) === targetId) activeTargetIds.delete(ownerId);
  }
  targetOwnerIds.delete(targetId);
}

export function createKokoCompactFileAiOwnerId(workspacePaneId: string) {
  return `koko:right-panel-sftp:${encodedFileAiIdentityPart(workspacePaneId)}`;
}

export function createKokoCompactFileAiTargetId(workspacePaneId: string, assetId: string, account: string) {
  return [
    "right-panel-sftp",
    encodedFileAiIdentityPart(workspacePaneId),
    encodedFileAiIdentityPart(assetId),
    encodedFileAiIdentityPart(account)
  ].join(":");
}

function createSession(targetId: string, socket: WebSocket, context: KokoFileAiContext): KokoFileAiSession {
  let session: KokoFileAiSession;
  const transport = markRaw(new KokoFileAiChatTransport(() => session));
  const relay = markRaw(
    new AgentToolRelay({
      resourceSessionId: () => session?.agent.state.resourceSessionId || "",
      revision: () => session?.agent.state.revision || 1,
      sendFrame: (frame) => {
        const target = session?.socket;
        if (!target || target.readyState !== WebSocket.OPEN) throw new Error("File MCP relay is disconnected");
        target.send(JSON.stringify({ id: createSftpMessageId(), ...kokoMcpWireMessage(frame) }));
      }
    })
  );
  const agent = markRaw(
    useAgentSession({
      domain: "file",
      relay,
      messageMetadata: () => ({ domain: "file", targetId, context: session?.context || context }),
      onMessage: (message) => handleKokoFileAiMessage(targetId, message),
      onAvailability: (available) => {
        if (session) session.enabled = available;
      },
      onApprovalMode: (mode) => {
        if (session) session.approvalMode = mode;
      },
      onHistoryReset: () => {
        if (!session) return;
        session.chat.messages.value = [];
        resetTaskState(session);
        session.pendingApprovals.clear();
        session.resolvingApprovals.clear();
        session.approvalDigests.clear();
        session.runtimeStatus = "";
        session.runtimeStatusCode = "";
        session.runtimeState = "";
        session.errorCode = "";
        session.errorText = "";
      },
      onUnavailable: (error) => {
        if (!session) return;
        session.errorCode = "agent_unavailable";
        session.errorText = error.message;
        resetTaskState(session);
        transport.disconnect();
      }
    })
  );
  const chatScope = effectScope(true);
  const chat = markRaw(
    chatScope.run(() =>
      useChat<FileAiChatMessage>({
        id: targetId,
        transport,
        generateId: () => createKokoFileAiMessageId("message"),
        onError: (error) => {
          if (error instanceof FileAiClientError) {
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
    kind: "file",
    targetId,
    socket: markRaw(socket),
    agent,
    chat,
    context,
    connected: context.connected && socket.readyState === WebSocket.OPEN,
    enabled: false,
    capabilityKnown: false,
    approvalMode: "auto",
    taskActive: false,
    draft: "",
    runtimeStatus: "",
    runtimeStatusCode: "",
    runtimeState: "",
    errorCode: "",
    errorText: "",
    pendingApprovals: new Set<string>(),
    resolvingApprovals: new Set<string>(),
    approvalDigests: new Map<string, string>()
  }) as KokoFileAiSession;
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  return session;
}

function partData(message: FileAiChatMessage, type: string) {
  const part = message.parts.find((candidate) => candidate.type === type);
  return part && "data" in part ? (part.data as FileAiEventData) : undefined;
}

function isFileAiChatMessage(message: unknown): message is FileAiChatMessage {
  if (!message || typeof message !== "object") return false;
  const value = message as Record<string, unknown>;
  if (typeof value.id !== "string" || (value.role !== "user" && value.role !== "assistant")) return false;
  if (!value.metadata || typeof value.metadata !== "object") return false;
  const metadata = value.metadata as Record<string, unknown>;
  if (metadata.domain !== "file") return false;
  if (!Array.isArray(value.parts)) return false;

  return value.parts.every((part) => {
    if (!part || typeof part !== "object") return false;
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text") return typeof candidate.text === "string";
    return typeof candidate.type === "string" && candidate.type.startsWith("data-") && "data" in candidate;
  });
}

export function isSuccessfulKokoFileAiMutationResult(message: unknown, targetId: string) {
  if (!isFileAiChatMessage(message) || message.metadata?.targetId !== targetId) return false;

  return message.parts.some((part) => {
    if (part.type !== "data-file-result" || !("data" in part)) return false;
    const data = part.data as FileAiEventData;
    return data.outcome === "success" && mutatingFileAiTools.has(String(data.tool || ""));
  });
}

function resetTaskState(session: KokoFileAiSession) {
  session.taskActive = false;
  session.pendingApprovals.clear();
  session.resolvingApprovals.clear();
  session.approvalDigests.clear();
}

function hasSameFileAiContextIdentity(left: KokoFileAiContext, right: KokoFileAiContext) {
  return left.assetId === right.assetId && (left.account || "") === (right.account || "");
}

function destroyKokoFileAiSession(targetId: string, session: KokoFileAiSession) {
  session.agent.actions.dispose();
  transports.get(session)?.disconnect();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(targetId);
}

export function registerKokoFileAiSession(targetId: string, socket: WebSocket, context: KokoFileAiContext) {
  if (!targetId) return null;
  pendingSessionReleases.delete(targetId);

  const existing = sessions.get(targetId);
  if (existing && !hasSameFileAiContextIdentity(existing.context, context)) {
    destroyKokoFileAiSession(targetId, existing);
    const session = createSession(targetId, socket, context);
    sessions.set(targetId, session);
    return session;
  }
  if (existing?.socket === socket) {
    existing.context = context;
    existing.connected = context.connected && socket.readyState === WebSocket.OPEN;
    if (existing.connected && !existing.capabilityKnown) existing.enabled = true;
    return existing;
  }
  if (existing) {
    existing.agent.actions.dispose();
    transports.get(existing)?.disconnect();
    resetTaskState(existing);
    existing.socket = markRaw(socket);
    existing.context = context;
    existing.connected = context.connected && socket.readyState === WebSocket.OPEN;
    existing.enabled = false;
    existing.capabilityKnown = false;
    existing.runtimeStatus = "";
    existing.runtimeStatusCode = "";
    existing.runtimeState = "";
    existing.errorCode = "";
    existing.errorText = "";
    existing.chat.clearError();
    return existing;
  }

  const session = createSession(targetId, socket, context);
  sessions.set(targetId, session);
  return session;
}

export function unregisterKokoFileAiSession(targetId: string, socket?: WebSocket | null) {
  const session = sessions.get(targetId);
  if (socket && (!session || session.socket !== socket)) return;
  pendingSessionReleases.delete(targetId);
  if (session) destroyKokoFileAiSession(targetId, session);
  removeFileAiTargetOwners(targetId);
}

export function releaseKokoFileAiSession(targetId: string, socket?: WebSocket | null) {
  const session = sessions.get(targetId);
  if (!session || (socket && session.socket !== socket)) return;
  disconnectKokoFileAiSession(targetId, socket);
  const release = Symbol(targetId);
  pendingSessionReleases.set(targetId, release);
  queueMicrotask(() => {
    if (pendingSessionReleases.get(targetId) !== release) return;
    pendingSessionReleases.delete(targetId);
    if (!targetOwnerIds.get(targetId)?.size) unregisterKokoFileAiSession(targetId, socket);
  });
}

export function connectKokoFileAiSession(targetId: string, socket: WebSocket) {
  const session = sessions.get(targetId);
  if (!session || session.socket !== socket) return;
  session.connected = true;
  session.context.connected = true;
}

export function disconnectKokoFileAiSession(targetId: string, socket?: WebSocket | null) {
  const session = sessions.get(targetId);
  if (!session || (socket && session.socket !== socket)) return;
  session.connected = false;
  session.context.connected = false;
  session.enabled = false;
  session.capabilityKnown = false;
  resetTaskState(session);
  session.agent.actions.dispose();
  transports.get(session)?.disconnect();
}

export function updateKokoFileAiContext(targetId: string, context: KokoFileAiContext) {
  const session = sessions.get(targetId);
  if (!session) return;
  if (session.socket && !hasSameFileAiContextIdentity(session.context, context)) {
    registerKokoFileAiSession(targetId, session.socket, context);
    return;
  }
  session.context = context;
}

export function setActiveKokoFileAiTarget(targetId: string | null, ownerId?: string) {
  const key = normalizedFileAiOwnerId(ownerId);
  if (targetId) {
    bindFileAiTargetOwner(key, targetId);
    activeTargetIds.set(key, targetId);
  } else activeTargetIds.delete(key);
}

export function disposeKokoFileAiOwner(ownerId?: string) {
  const key = normalizedFileAiOwnerId(ownerId);
  activeTargetIds.delete(key);
  const targets = [...(ownerTargetIds.get(key) || [])];
  ownerTargetIds.delete(key);
  for (const targetId of targets) {
    const targetOwners = targetOwnerIds.get(targetId);
    targetOwners?.delete(key);
    if (targetOwners?.size) continue;
    targetOwnerIds.delete(targetId);
    unregisterKokoFileAiSession(targetId);
  }
}

export function getActiveKokoFileAiTargetId(ownerId?: string) {
  return activeTargetIds.get(normalizedFileAiOwnerId(ownerId)) || null;
}

export function getKokoFileAiSession(targetId: string) {
  return sessions.get(targetId) || null;
}

export function getActiveKokoFileAiSession(ownerId?: string) {
  const targetId = getActiveKokoFileAiTargetId(ownerId);
  return targetId ? getKokoFileAiSession(targetId) : null;
}

export function isKokoFileAiAvailable(targetId: string) {
  const session = sessions.get(targetId);
  return Boolean(
    session?.connected &&
    session.enabled &&
    session.agent.state.available &&
    session.socket?.readyState === WebSocket.OPEN
  );
}

export function isKokoFileAiWaitingForApproval(targetId: string) {
  return Boolean(sessions.get(targetId)?.pendingApprovals.size);
}

export function isKokoFileAiBusy(targetId: string) {
  const session = sessions.get(targetId);
  return Boolean(session?.pendingApprovals.size);
}

export async function submitKokoFileAiPrompt(targetId: string, text: string): Promise<void> {
  const session = sessions.get(targetId);
  const socket = session?.socket;
  if (!session?.connected || !session.enabled || !socket || socket.readyState !== WebSocket.OPEN) {
    throw clientError("unavailable", "File AI is not available for the active file session");
  }

  const prompt = text.trim();
  if (!prompt) throw clientError("invalid_message", "File AI requires a user message");
  if (session.pendingApprovals.size) throw clientError("response_active", "File AI is waiting for approval");

  const transport = transports.get(session);
  if (!transport) throw clientError("unavailable", "File AI is not available for the active file session");

  session.errorCode = "";
  session.errorText = "";
  session.chat.clearError();
  session.taskActive = true;
  try {
    const dispatched = transport.waitForNextDispatch();
    const response = session.chat.sendMessage({
      text: prompt,
      metadata: { domain: "file", targetId, context: session.context }
    });
    void response.catch(() => {
      session.taskActive = false;
      if (!session.errorCode && !session.errorText) session.errorCode = "send_failed";
    });
    await dispatched;
  } catch (error) {
    session.taskActive = false;
    const failure = error instanceof Error ? error : clientError("send_failed", "Failed to send File AI message");
    transport.cancelPendingDispatch(failure);
    if (failure instanceof FileAiClientError) {
      session.errorCode = failure.code;
      session.errorText = "";
    } else {
      session.errorCode = "send_failed";
      session.errorText = failure.message;
    }
    throw failure;
  }
}

export function handleKokoFileAiWireMessage(targetId: string, message: unknown) {
  const frame = parseKokoMcpFrame(message);
  if (!frame) return false;
  const session = sessions.get(targetId);
  if (!session) return true;
  if (frame.type === "mcp.manifest") {
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

export function handleKokoFileAiMessage(targetId: string, message: unknown) {
  const session = sessions.get(targetId);
  if (!session || !isFileAiChatMessage(message)) return;
  const messageTargetId = String(message.metadata?.targetId || "");
  if (messageTargetId && messageTargetId !== targetId) return;
  const { runFinished } = agentChatEventLifecycle(message);

  const capability = partData(message, "data-capability");
  if (capability) {
    session.capabilityKnown = true;
    session.enabled = capability.enabled !== false;
    if (!session.enabled) resetTaskState(session);
  }

  const approval = partData(message, "data-file-approval");
  if (approval) {
    const approvalId = String(approval.id || "");
    const approvalState = String(approval.state || approval.status || "");
    const resolved =
      Boolean(approval.resolved) || ["approved", "rejected", "cancelled", "expired"].includes(approvalState);
    if (approvalId && resolved) {
      session.pendingApprovals.delete(approvalId);
      session.resolvingApprovals.delete(approvalId);
      session.approvalDigests.delete(approvalId);
    } else if (approvalId && message.role === "assistant") {
      session.pendingApprovals.add(approvalId);
      const digest = String(approval.digest || "");
      if (digest) session.approvalDigests.set(approvalId, digest);
    }
  }

  const progress = partData(message, "data-progress");
  const terminalState = String(progress?.state || "");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    session.runtimeStatusCode = String(progress.code || "");
    session.runtimeState = terminalState;
    if (terminalState && !runFinished) session.taskActive = true;
  }

  const runtimeError = partData(message, "data-error");
  if (runtimeError) {
    session.errorCode = String(runtimeError.code || "failed");
    session.errorText = String(runtimeError.message || "File AI failed");
    resetTaskState(session);
  }

  const transport = transports.get(session);
  const streamMessage = agentChatStreamMessage(
    message,
    (part) => part.type !== "data-capability" && part.type !== "data-progress"
  );
  if (!streamMessage) {
    if (!session.enabled || runtimeError || runFinished) {
      resetTaskState(session);
      transport?.finish();
    }
    return;
  }
  if (!transport?.receive(streamMessage)) {
    const timelineParts = streamMessage.parts.filter((part) => part.type !== "data-error");
    if (timelineParts.length) {
      const timelineMessage = { ...message, parts: timelineParts } as FileAiChatMessage;
      session.chat.messages.value = [...session.chat.messages.value, timelineMessage];
    }
  }

  if (!session.enabled || runtimeError || runFinished) {
    resetTaskState(session);
    transport?.finish();
  }
}

export function sendKokoFileAiControl(targetId: string, parts: FileAiChatMessage["parts"]) {
  const session = sessions.get(targetId);
  const socket = session?.socket;
  if (
    !session?.connected ||
    !session.enabled ||
    !session.agent.state.available ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    throw clientError("unavailable", "File AI is not available for the active file session");
  }

  const message: FileAiChatMessage = {
    id: createKokoFileAiMessageId("control"),
    role: "user",
    metadata: { domain: "file", targetId, context: session.context },
    parts
  };
  let handled = false;
  for (const part of parts) {
    if (!("data" in part)) continue;
    const data = part.data as FileAiEventData;
    if (part.type === "data-file-approval") {
      const approvalId = String(data.id || "");
      if (!approvalId) continue;
      handled = true;
      const decision = data.decision === "approve" ? "approve" : "reject";
      void session.agent.actions.resolveApproval(approvalId, decision).catch((error) => {
        session.resolvingApprovals.delete(approvalId);
        session.errorCode = "approval_failed";
        session.errorText = error instanceof Error ? error.message : "Failed to submit approval";
      });
    }
    if (part.type === "data-interrupt") {
      handled = true;
      void session.agent.actions.cancel().catch((error) => {
        session.errorCode = "interrupt_failed";
        session.errorText = error instanceof Error ? error.message : "Failed to cancel Agent run";
      });
      session.chat.stop();
    }
    if (part.type === "data-policy") {
      const mode = String(data.approvalMode || "");
      if (mode === "always" || mode === "auto" || mode === "never") {
        void session.agent.actions.setApprovalMode(mode).catch((error) => {
          session.errorCode = "policy_failed";
          session.errorText = error instanceof Error ? error.message : "Failed to update approval mode";
        });
      }
      handled = true;
    }
  }
  if (!handled) {
    void session.agent.actions.sendMessage(message).catch((error) => {
      session.errorCode = "send_failed";
      session.errorText = error instanceof Error ? error.message : "Failed to send Agent control message";
    });
  }
}

export function resolveKokoFileAiApproval(targetId: string, approvalId: string, decision: KokoFileAiApprovalDecision) {
  const session = sessions.get(targetId);
  const digest = session?.approvalDigests.get(approvalId) || "";
  if (!session || !session.pendingApprovals.has(approvalId) || !digest) {
    throw clientError("invalid_approval", "File AI approval is no longer available");
  }
  if (session.resolvingApprovals.has(approvalId)) return;

  session.resolvingApprovals.add(approvalId);
  try {
    sendKokoFileAiControl(targetId, [{ type: "data-file-approval", data: { id: approvalId, digest, decision } }]);
  } catch (error) {
    session.resolvingApprovals.delete(approvalId);
    throw error;
  }
}

export function interruptKokoFileAiSession(targetId: string) {
  const session = sessions.get(targetId);
  if (!session) return;
  sendKokoFileAiControl(targetId, [{ type: "data-interrupt", data: { reason: "user" } }]);
  session.chat.stop();
}

export const interruptKokoFileAi = interruptKokoFileAiSession;

export function createKokoFileAiMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toKokoFileAiSelectedEntry(
  currentPath: string,
  entry: {
    name: string;
    size: string;
    perm: string;
    mod_time: string;
    type: string;
    is_dir: boolean;
    version?: string;
  }
): KokoFileAiSelectedEntry {
  return {
    name: entry.name,
    path: joinSftpPath(currentPath || "/", entry.name),
    size: entry.size,
    perm: entry.perm,
    modTime: entry.mod_time,
    type: entry.type,
    isDirectory: entry.is_dir,
    ...(entry.version ? { version: entry.version } : {})
  };
}
