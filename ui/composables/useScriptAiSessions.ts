import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import type {
  AgentApprovalMode,
  AgentMcpManifest,
  KokoMcpCancelFrame,
  KokoMcpCancelResultFrame,
  KokoMcpRequestFrame,
  KokoMcpResponseFrame
} from "#koko/composables/agent/types";
import type { AgentSessionController } from "#koko/composables/agent/useAgentSession";
import type { SnippetVariableDefinition } from "~/utils/snippetVariables";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import { agentChatTextId, closeAgentChatText } from "#koko/composables/agent/agentChatStream";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import {
  AGENT_MCP_BINDING_META_KEY,
  AGENT_PROTOCOL_VERSION,
  MCP_FINAL_RESULT_META_KEY,
  isRecord
} from "#koko/composables/agent/types";
import { useAgentSession } from "#koko/composables/agent/useAgentSession";
import { normalizeSnippetVariableDefinitions } from "~/utils/snippetVariables";

export const SCRIPT_AI_MODULES = [
  "shell",
  "win_shell",
  "python",
  "raw",
  "mysql",
  "mariadb",
  "postgresql",
  "sqlserver",
  "oracle"
] as const;

export type ScriptAiModule = (typeof SCRIPT_AI_MODULES)[number];
export type ScriptAiEventData = Record<string, any>;
export type ScriptAiChatMessage = UIMessage<ScriptAiEventData, Record<string, ScriptAiEventData>>;

export interface ScriptAiSnapshot {
  paneId: string;
  scriptId: string;
  name: string;
  content: string;
  module: ScriptAiModule;
  comment: string;
  scope: "private" | "public";
  variables: SnippetVariableDefinition[];
  revision: number;
}

export interface ScriptAiProposal {
  content: string;
  name: string;
  module: ScriptAiModule;
  comment: string;
  summary: string;
  riskLevel: number;
  risks: string[];
  variables: SnippetVariableDefinition[];
  base: ScriptAiSnapshot;
}

export interface ScriptAiProposalApplyResult {
  applied: boolean;
  reason?: "invalid" | "stale";
}

export interface PendingScriptProposalCall {
  requestId: string;
  resourceSessionId: string;
}

export interface ScriptAiSession {
  kind: "script";
  paneId: string;
  resourceSessionId: string;
  agent: AgentSessionController;
  chat: UseChatHelpers<ScriptAiChatMessage>;
  enabled: boolean;
  approvalMode: AgentApprovalMode;
  inputLocked: boolean;
  taskActive: boolean;
  draft: string;
  runtimeStatus: string;
  runtimeStatusCode: string;
  runtimeState: string;
  errorCode: string;
  errorText: string;
  proposals: Map<string, ScriptAiProposal>;
  proposalErrors: Map<string, string>;
  proposalDecisions: Map<string, "applied" | "rejected" | "stale">;
  pendingProposalCalls: Map<string, PendingScriptProposalCall>;
  contextProvider: () => ScriptAiSnapshot;
  proposalApplier: (proposal: ScriptAiProposal) => ScriptAiProposalApplyResult;
}

class ScriptAiClientError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ScriptAiClientError";
  }
}

interface ActiveResponse {
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

class ScriptAiTransport implements ChatTransport<ScriptAiChatMessage> {
  private activeResponse: ActiveResponse | null = null;
  private readonly pendingDispatches: PendingChatDispatch[] = [];

  constructor(private readonly getSession: () => ScriptAiSession) {}

  sendMessages: ChatTransport<ScriptAiChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    const dispatch = this.pendingDispatches.shift();
    const session = this.getSession();
    if (!session.enabled || !session.agent.state.available) {
      const error = new ScriptAiClientError("unavailable", "Script AI is unavailable for this editor");
      dispatch?.reject(error);
      throw error;
    }
    if (this.activeResponse) {
      const error = new ScriptAiClientError("response_active", "Another Script AI request is active");
      dispatch?.reject(error);
      throw error;
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") {
      const error = new ScriptAiClientError("invalid_message", "Script AI requires a user message");
      dispatch?.reject(error);
      throw error;
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
      const abortHandler = () => this.finish(response!);
      if (abortSignal) {
        response.abortHandler = abortHandler;
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }
      if (abortSignal?.aborted) throw new DOMException("Script AI request was aborted", "AbortError");

      session.taskActive = true;
      await session.agent.actions.sendMessage({
        ...message,
        metadata: { ...message.metadata, domain: "script", targetId: session.paneId }
      });
      dispatch?.resolve();
      return stream;
    } catch (cause) {
      const error =
        cause instanceof ScriptAiClientError
          ? cause
          : new ScriptAiClientError(
              "send_failed",
              cause instanceof Error ? cause.message : "Failed to send Script AI request"
            );
      dispatch?.reject(error);
      if (response) this.fail(response, error);
      throw error;
    }
  };

  reconnectToStream: ChatTransport<ScriptAiChatMessage>["reconnectToStream"] = async () => null;

  receive(message: ScriptAiChatMessage) {
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
      if (part.type.startsWith("data-") && "data" in part) {
        closeAgentChatText(response);
        response.controller.enqueue({ type: part.type, id: `${message.id}-${index}`, data: part.data });
      }
    }
    return true;
  }

  finish(response = this.activeResponse) {
    if (!response) return;
    closeAgentChatText(response);
    if (response.started) response.controller.enqueue({ type: "finish", finishReason: "stop" });
    response.controller.close();
    this.clear(response);
  }

  disconnect() {
    const error = new ScriptAiClientError("unavailable", "Script AI session disconnected");
    for (const dispatch of this.pendingDispatches.splice(0)) dispatch.reject(error);
    this.finish();
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

  private fail(response: ActiveResponse, error: Error) {
    response.controller.error(error);
    this.clear(response);
  }

  private clear(response: ActiveResponse) {
    if (response.abortSignal && response.abortHandler) {
      response.abortSignal.removeEventListener("abort", response.abortHandler);
    }
    if (this.activeResponse === response) this.activeResponse = null;
  }
}

const sessions = shallowReactive(new Map<string, ScriptAiSession>());
const transports = new WeakMap<ScriptAiSession, ScriptAiTransport>();
const chatScopes = new WeakMap<ScriptAiSession, EffectScope>();

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

export function scriptAiManifest(resourceSessionId: string, snapshot: ScriptAiSnapshot): AgentMcpManifest {
  return {
    profile: "script",
    resourceSessionId,
    revision: 1,
    context: {
      session_kind: "script_editor",
      interaction_mode: "draft_only",
      command_language: snapshot.module,
      dialect: snapshot.module,
      protocol: "script-editor",
      asset_id: snapshot.scriptId,
      asset_name: snapshot.name,
      platform_type: snapshot.module
    },
    tools: [
      {
        name: "read_script",
        title: "Read current script",
        description:
          "Read the current unsaved editor buffer, metadata, revision, and variable definitions. Call this before analysis or proposing changes.",
        inputSchema: { type: "object", additionalProperties: false, maxProperties: 0 },
        annotations: readOnlyAnnotations
      },
      {
        name: "propose_script",
        title: "Propose script changes",
        description:
          "Prepare a script change and wait for the user's explicit apply or reject decision. The tool completes only after that decision and never saves or executes the script. expected_revision must come from the latest read_script result.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["expected_revision", "content", "name", "module", "comment", "summary", "risk_level", "risks"],
          properties: {
            expected_revision: {
              type: "integer",
              minimum: 1,
              description: "Exact revision returned by the latest read_script call"
            },
            content: {
              type: "string",
              minLength: 1,
              maxLength: 8192,
              description: "Complete replacement content for the proposed script draft"
            },
            name: { type: "string", minLength: 1, maxLength: 128, description: "Proposed script name" },
            module: {
              type: "string",
              enum: [...SCRIPT_AI_MODULES],
              description: "Script language/module; preserve the current value unless the user requests a conversion"
            },
            comment: { type: "string", maxLength: 1024, description: "Optional operator-facing script comment" },
            summary: {
              type: "string",
              minLength: 1,
              maxLength: 2048,
              description: "Concise explanation of the proposed change"
            },
            risk_level: {
              type: "integer",
              minimum: 1,
              maximum: 4,
              description: "Risk severity from 1 (low) to 4 (critical)"
            },
            risks: {
              type: "array",
              maxItems: 16,
              description: "Concrete operational or security risks introduced by the proposal",
              items: { type: "string", minLength: 1, maxLength: 512 }
            },
            variables: {
              type: "array",
              maxItems: 32,
              description: "Variable definitions only; never include credential or secret values",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "var_name", "type", "required", "tips", "options"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 1024 },
                  var_name: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$" },
                  type: { type: "string", enum: ["text", "select"] },
                  required: { type: "boolean" },
                  tips: { type: "string", maxLength: 1024 },
                  options: {
                    type: "array",
                    maxItems: 64,
                    items: { type: "string", maxLength: 256 }
                  }
                }
              }
            }
          }
        },
        annotations: readOnlyAnnotations,
        _meta: { [MCP_FINAL_RESULT_META_KEY]: true }
      }
    ]
  };
}

function boundedString(value: unknown, maximum: number) {
  return String(value ?? "").slice(0, maximum);
}

function normalizeProposalVariables(value: unknown): SnippetVariableDefinition[] {
  if (!Array.isArray(value)) return [];
  return normalizeSnippetVariableDefinitions(
    value.map((item) => {
      const raw = isRecord(item) ? item : {};
      return {
        name: raw.name,
        var_name: raw.var_name,
        type: raw.type,
        required: raw.required,
        tips: raw.tips,
        default_value: "",
        extra_args: Array.isArray(raw.options) ? raw.options.map(String).join("\n") : ""
      };
    })
  );
}

export function normalizeScriptAiProposal(
  value: unknown,
  snapshot: ScriptAiSnapshot
): ScriptAiProposal | { error: string } {
  if (!isRecord(value)) return { error: "Script proposal arguments are invalid" };
  const expectedRevision = Number(value.expected_revision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== snapshot.revision) {
    return { error: "The script changed after it was read; read_script must be called again" };
  }
  const content = String(value.content ?? "");
  if (!content.trim() || content.length > 8192) return { error: "Proposed script content is invalid" };
  const module = String(value.module || "");
  if (!SCRIPT_AI_MODULES.includes(module as ScriptAiModule)) return { error: "Proposed script module is invalid" };
  const name = boundedString(value.name, 128).trim();
  if (!name) return { error: "Proposed script name is required" };

  return {
    content,
    name,
    module: module as ScriptAiModule,
    comment: boundedString(value.comment, 1024),
    summary: boundedString(value.summary, 2048),
    riskLevel: Math.max(1, Math.min(4, Math.floor(Number(value.risk_level) || 1))),
    risks: Array.isArray(value.risks)
      ? value.risks
          .slice(0, 16)
          .map((risk) => boundedString(risk, 512))
          .filter(Boolean)
      : [],
    variables:
      value.variables === undefined
        ? snapshot.variables.map((variable) => ({ ...variable }))
        : normalizeProposalVariables(value.variables),
    base: {
      ...snapshot,
      variables: snapshot.variables.map((variable) => ({ ...variable }))
    }
  };
}

function toolCallId(frame: KokoMcpRequestFrame) {
  const meta = isRecord(frame.data.params._meta) ? frame.data.params._meta : {};
  const binding = isRecord(meta[AGENT_MCP_BINDING_META_KEY]) ? meta[AGENT_MCP_BINDING_META_KEY] : {};
  return String(binding.tool_call_id || frame.data.id);
}

function textResult(text: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text", text }], structuredContent };
}

function queueLocalResponse(session: ScriptAiSession, frame: KokoMcpResponseFrame | KokoMcpCancelResultFrame) {
  queueMicrotask(() => {
    void session.agent.actions.receiveKokoFrame(frame).catch((cause) => {
      session.errorCode = "tool_result_failed";
      session.errorText = cause instanceof Error ? cause.message : "Failed to deliver Script AI tool result";
    });
  });
}

function settleScriptAiProposal(
  session: ScriptAiSession,
  callId: string,
  result: ReturnType<typeof textResult> | null,
  error = ""
) {
  const pending = session.pendingProposalCalls.get(callId);
  if (!pending) return false;
  session.pendingProposalCalls.delete(callId);
  queueLocalResponse(session, {
    type: "mcp.response",
    version: AGENT_PROTOCOL_VERSION,
    resource_session_id: pending.resourceSessionId,
    data: {
      jsonrpc: "2.0",
      id: pending.requestId,
      ...(error ? { error: { code: -32602, message: error } } : { result })
    }
  });
  return true;
}

function cancelPendingScriptProposal(session: ScriptAiSession, requestId: string) {
  for (const [callId, call] of session.pendingProposalCalls) {
    if (call.requestId !== requestId) continue;
    session.pendingProposalCalls.delete(callId);
    session.proposalDecisions.set(callId, "rejected");
    return;
  }
}

function handleLocalToolFrame(session: ScriptAiSession, frame: KokoMcpRequestFrame | KokoMcpCancelFrame) {
  if (frame.type === "mcp.cancel") {
    cancelPendingScriptProposal(session, String(frame.data.params.requestId));
    queueLocalResponse(session, {
      type: "mcp.cancel_result",
      version: AGENT_PROTOCOL_VERSION,
      resource_session_id: frame.resource_session_id,
      data: { jsonrpc: "2.0", id: frame.data.params.requestId, result: { cancelled: true } }
    });
    return;
  }

  const name = String(frame.data.params.name || "");
  const args = isRecord(frame.data.params.arguments) ? frame.data.params.arguments : {};
  const callId = toolCallId(frame);
  let result: ReturnType<typeof textResult> | null = null;
  let error = "";
  if (name === "read_script") {
    const snapshot = session.contextProvider();
    result = textResult(
      JSON.stringify({
        ...snapshot,
        variables: snapshot.variables.map(({ defaultValue: _defaultValue, ...variable }) => ({
          ...variable,
          hasDefault: Boolean(_defaultValue)
        }))
      }),
      { revision: snapshot.revision, module: snapshot.module, scope: snapshot.scope }
    );
  } else if (name === "propose_script") {
    const normalized = normalizeScriptAiProposal(args, session.contextProvider());
    if ("error" in normalized) {
      error = normalized.error;
      session.proposalErrors.set(callId, error);
    } else {
      session.proposals.set(callId, normalized);
      session.proposalErrors.delete(callId);
      session.pendingProposalCalls.set(callId, {
        requestId: String(frame.data.id),
        resourceSessionId: frame.resource_session_id
      });
      return;
    }
  } else {
    error = `Unknown Script AI tool: ${name}`;
  }

  queueLocalResponse(session, {
    type: "mcp.response",
    version: AGENT_PROTOCOL_VERSION,
    resource_session_id: frame.resource_session_id,
    data: {
      jsonrpc: "2.0",
      id: frame.data.id,
      ...(error ? { error: { code: -32602, message: error } } : { result })
    }
  });
}

export function acceptScriptAiProposal(
  paneId: string,
  callId: string,
  proposal: ScriptAiProposal
): ScriptAiProposalApplyResult {
  const session = sessions.get(paneId);
  if (!session) {
    return { applied: false, reason: "invalid" };
  }
  if (!session.pendingProposalCalls.has(callId) || session.proposals.get(callId) !== proposal) {
    settleScriptAiProposal(session, callId, null, "The script proposal is no longer available");
    return { applied: false, reason: "invalid" };
  }
  const applied = session.proposalApplier(proposal);
  if (!applied.applied) {
    settleScriptAiProposal(
      session,
      callId,
      null,
      "The script changed before the proposal was applied; read_script must be called again"
    );
    return applied;
  }
  settleScriptAiProposal(
    session,
    callId,
    textResult("The user applied the proposal to the editor. It has not been saved or executed.", {
      proposal_id: callId,
      status: "applied"
    })
  );
  return applied;
}

export function rejectScriptAiProposal(paneId: string, callId: string) {
  const session = sessions.get(paneId);
  if (!session || !session.pendingProposalCalls.has(callId) || !session.proposals.has(callId)) return false;
  return settleScriptAiProposal(
    session,
    callId,
    textResult("The user rejected the proposal. It was not applied, saved, or executed.", {
      proposal_id: callId,
      status: "rejected"
    })
  );
}

function createSession(
  paneId: string,
  contextProvider: () => ScriptAiSnapshot,
  proposalApplier: (proposal: ScriptAiProposal) => ScriptAiProposalApplyResult
) {
  let session: ScriptAiSession;
  const transport = markRaw(new ScriptAiTransport(() => session));
  const resourceSessionId = `script-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const relay = markRaw(
    new AgentToolRelay({
      resourceSessionId: () => resourceSessionId,
      revision: () => 1,
      sendFrame: (frame) => handleLocalToolFrame(session, frame)
    })
  );
  const agent = markRaw(
    useAgentSession({
      domain: "script",
      relay,
      messageMetadata: () => ({ domain: "script", targetId: paneId }),
      onMessage: (message) => handleScriptAiMessage(paneId, message),
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
        session.proposals.clear();
        session.proposalErrors.clear();
        session.proposalDecisions.clear();
        session.pendingProposalCalls.clear();
        session.runtimeStatus = "";
        session.runtimeStatusCode = "";
        session.runtimeState = "";
        session.errorCode = "";
        session.errorText = "";
      },
      onUnavailable: (cause) => {
        if (!session) return;
        session.errorCode = "agent_unavailable";
        session.errorText = cause.message;
        session.taskActive = false;
        transport.disconnect();
      }
    })
  );
  const chatScope = effectScope(true);
  const chat = markRaw(
    chatScope.run(() =>
      useChat<ScriptAiChatMessage>({
        id: `script:${paneId}`,
        transport,
        generateId: () => `script-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        onError: (cause) => {
          session.taskActive = false;
          session.inputLocked = false;
          session.errorCode = cause instanceof ScriptAiClientError ? cause.code : "failed";
          session.errorText = cause.message;
        }
      })
    )!
  );

  session = reactive({
    kind: "script",
    paneId,
    resourceSessionId,
    agent,
    chat,
    enabled: false,
    approvalMode: "auto",
    inputLocked: false,
    taskActive: false,
    draft: "",
    runtimeStatus: "",
    runtimeStatusCode: "",
    runtimeState: "",
    errorCode: "",
    errorText: "",
    proposals: new Map(),
    proposalErrors: new Map(),
    proposalDecisions: new Map(),
    pendingProposalCalls: new Map(),
    contextProvider: markRaw(contextProvider),
    proposalApplier: markRaw(proposalApplier)
  }) as ScriptAiSession;
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  return session;
}

function partData(message: ScriptAiChatMessage, type: string) {
  const part = message.parts.find((candidate) => candidate.type === type);
  return part && "data" in part ? (part.data as ScriptAiEventData) : undefined;
}

export function scriptAiTimelineMessage(message: ScriptAiChatMessage) {
  const parts = message.parts.filter((part) => {
    if (["data-capability", "data-input-lock", "data-approval", "data-error"].includes(part.type)) return false;
    if (part.type !== "data-progress" || !("data" in part)) return true;
    const data = isRecord(part.data) ? part.data : {};
    return String(data.tool_name || data.name || "") === "propose_script";
  });
  return parts.length ? ({ ...message, parts } as ScriptAiChatMessage) : null;
}

export function scriptAiReadOnlyApprovalId(value: unknown) {
  if (!isRecord(value) || value.resolved === true) return "";
  const tool = String(value.tool || "");
  if (tool !== "read_script" && tool !== "propose_script") return "";
  return String(value.approvalId || value.id || "");
}

function isScriptAiChatMessage(value: unknown): value is ScriptAiChatMessage {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if ((value.role !== "user" && value.role !== "assistant") || !Array.isArray(value.parts)) return false;
  return value.parts.every((part) => {
    if (!isRecord(part) || typeof part.type !== "string") return false;
    return part.type === "text" ? typeof part.text === "string" : part.type.startsWith("data-") && "data" in part;
  });
}

export function handleScriptAiMessage(paneId: string, value: unknown) {
  const session = sessions.get(paneId);
  if (!session || !isScriptAiChatMessage(value)) return;
  const message = value;
  const transport = transports.get(session);

  const capability = partData(message, "data-capability");
  if (capability) {
    session.enabled = Boolean(capability.enabled);
    if (!session.enabled) {
      session.taskActive = false;
      session.inputLocked = false;
    }
  }
  const inputLock = partData(message, "data-input-lock");
  if (inputLock) session.inputLocked = Boolean(inputLock.locked);
  const approvalId = scriptAiReadOnlyApprovalId(partData(message, "data-approval"));
  if (approvalId) {
    void session.agent.actions.resolveApproval(approvalId, "approve").catch((cause) => {
      session.errorCode = "approval_failed";
      session.errorText = cause instanceof Error ? cause.message : "Failed to approve Script AI read-only tool";
    });
  }
  const progress = partData(message, "data-progress");
  const runtimeState = String(progress?.state || "");
  if (progress) {
    session.runtimeStatus = String(progress.text || "");
    const toolName = String(progress.tool_name || progress.name || "");
    session.runtimeStatusCode = toolName === "propose_script" ? "proposing" : String(progress.code || "");
    session.runtimeState = runtimeState;
    if (["completed", "failed", "cancelled", "interrupted"].includes(runtimeState)) {
      session.taskActive = false;
      session.inputLocked = false;
    } else if (runtimeState) {
      session.taskActive = true;
    }
  }
  const runtimeError = partData(message, "data-error");
  if (runtimeError) {
    session.taskActive = false;
    session.inputLocked = false;
    session.errorCode = String(runtimeError.code || "failed");
    session.errorText = String(runtimeError.message || "Script AI failed");
  }

  const timelineMessage = scriptAiTimelineMessage(message);
  if (timelineMessage && !transport?.receive(timelineMessage)) {
    session.chat.messages.value = [...session.chat.messages.value, timelineMessage];
  }

  if (!session.enabled || runtimeError || ["completed", "failed", "cancelled", "interrupted"].includes(runtimeState)) {
    transport?.finish();
  }
}

export function registerScriptAiSession(
  paneId: string,
  contextProvider: () => ScriptAiSnapshot,
  proposalApplier: (proposal: ScriptAiProposal) => ScriptAiProposalApplyResult
) {
  if (!paneId) return null;
  const existing = sessions.get(paneId);
  if (existing) {
    existing.contextProvider = markRaw(contextProvider);
    existing.proposalApplier = markRaw(proposalApplier);
    return existing;
  }

  const session = createSession(paneId, contextProvider, proposalApplier);
  sessions.set(paneId, session);
  void session.agent.actions
    .attachManifest(scriptAiManifest(session.resourceSessionId, contextProvider()))
    .catch((cause) => {
      session.errorCode = "agent_unavailable";
      session.errorText = cause instanceof Error ? cause.message : "Failed to create Script AI session";
    });
  return session;
}

export function unregisterScriptAiSession(paneId: string) {
  const session = sessions.get(paneId);
  if (!session) return;
  transports.get(session)?.disconnect();
  void session.agent.actions.dispose();
  chatScopes.get(session)?.stop();
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(paneId);
}

export function getScriptAiSession(paneId: string) {
  return sessions.get(paneId) || null;
}

export function isScriptAiAvailable(paneId: string) {
  const session = sessions.get(paneId);
  return Boolean(session?.enabled && session.agent.state.available);
}

export function isScriptAiBusy(paneId: string) {
  const session = sessions.get(paneId);
  if (!session) return false;
  const status = session.chat.status.value;
  return session.inputLocked || session.taskActive || status === "submitted" || status === "streaming";
}

export async function submitScriptAiPrompt(paneId: string, prompt: string) {
  const session = sessions.get(paneId);
  if (!session || !isScriptAiAvailable(paneId)) {
    throw new ScriptAiClientError("unavailable", "Script AI is unavailable for this editor");
  }
  const text = prompt.trim();
  if (!text) throw new ScriptAiClientError("invalid_message", "Script AI requires a user message");
  if (isScriptAiBusy(paneId)) throw new ScriptAiClientError("response_active", "A Script AI response is active");

  const transport = transports.get(session);
  if (!transport) throw new ScriptAiClientError("unavailable", "Script AI is unavailable for this editor");

  session.errorCode = "";
  session.errorText = "";
  session.chat.clearError();
  session.taskActive = true;
  try {
    const dispatched = transport.waitForNextDispatch();
    const response = session.chat.sendMessage({ text, metadata: { domain: "script", targetId: paneId } });
    void response.catch(() => {
      session.taskActive = false;
      if (!session.errorCode && !session.errorText) session.errorCode = "send_failed";
    });
    await dispatched;
  } catch (cause) {
    session.taskActive = false;
    const error =
      cause instanceof Error ? cause : new ScriptAiClientError("send_failed", "Failed to send Script AI request");
    transport.cancelPendingDispatch(error);
    if (error instanceof ScriptAiClientError) {
      session.errorCode = error.code;
      session.errorText = error.message;
    } else {
      session.errorCode = "send_failed";
      session.errorText = error.message;
    }
    throw error;
  }
}

export function interruptScriptAi(paneId: string) {
  const session = sessions.get(paneId);
  if (!session) return;
  void session.agent.actions.cancel().catch((cause) => {
    session.errorCode = "interrupt_failed";
    session.errorText = cause instanceof Error ? cause.message : "Failed to interrupt Script AI";
  });
  session.chat.stop();
  session.taskActive = false;
  session.inputLocked = false;
}
