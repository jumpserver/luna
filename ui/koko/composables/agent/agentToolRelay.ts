import type {
  AgentEvent,
  AgentToolResultRequest,
  JsonRpcCancelNotification,
  JsonRpcRequest,
  KokoMcpCancelFrame,
  KokoMcpRequestFrame
} from "./types";
import {
  AGENT_MCP_BINDING_META_KEY,
  AGENT_PROTOCOL_VERSION,
  MCP_CLIENT_CAPABILITIES_META_KEY,
  MCP_CLIENT_INFO_META_KEY,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_META_KEY,
  isRecord,
  parseKokoMcpFrame
} from "./types";

const DEFAULT_COMPLETED_LIMIT = 256;

export interface AgentToolRelayResult {
  toolCallId: string;
  payload: AgentToolResultRequest | null;
  complete: (delivered: boolean) => void;
}

export interface AgentToolRelayOptions {
  resourceSessionId: () => string;
  revision?: () => number;
  transformToolArguments?: (toolCallId: string, toolName: string, argumentsValue: unknown) => unknown;
  sendFrame: (frame: KokoMcpRequestFrame | KokoMcpCancelFrame) => void;
  completedLimit?: number;
}

function mcpTextContent(result: Record<string, unknown>) {
  if (!Array.isArray(result.content)) return "";
  return result.content
    .flatMap((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? [item.text] : []))
    .join("\n");
}

function normalizeMcpResult(result: unknown): Pick<AgentToolResultRequest, "status" | "result" | "error"> {
  if (!isRecord(result)) return { status: "success", result };
  const text = mcpTextContent(result);
  if (result.isError === true) {
    return {
      status: "error",
      error: {
        code: -32000,
        message: text || "MCP tool execution failed",
        ...(result.structuredContent !== undefined && result.structuredContent !== null
          ? { data: result.structuredContent }
          : {})
      }
    };
  }
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return { status: "success", result: result.structuredContent };
  }
  if (text) {
    try {
      return { status: "success", result: JSON.parse(text) };
    } catch {
      return { status: "success", result: text };
    }
  }
  return { status: "success", result };
}

export class AgentToolRelay {
  private readonly pending = new Set<string>();
  private readonly responding = new Set<string>();
  private readonly completed = new Set<string>();
  private readonly completedOrder: string[] = [];
  private readonly completedControls = new Set<string>();
  private readonly respondingControls = new Set<string>();
  private readonly completedControlOrder: string[] = [];
  private readonly cancelled = new Set<string>();
  private readonly cancelledOrder: string[] = [];
  private readonly rpcToolCalls = new Map<string, string>();
  private readonly pendingCalls = new Map<string, { rpcId: string; runId: string; revision: number }>();
  private readonly completedLimit: number;
  private epoch = 0;

  constructor(private readonly options: AgentToolRelayOptions) {
    this.completedLimit = Math.max(1, options.completedLimit || DEFAULT_COMPLETED_LIMIT);
  }

  forwardAgentEvent(event: AgentEvent) {
    if (event.type !== "tool.call" && event.type !== "tool.cancel") return false;
    const payload = event.payload || {};
    const resourceSessionId = String(
      event.resource_session_id || payload.resource_session_id || this.options.resourceSessionId()
    );
    const toolCallId = String(event.tool_call_id || payload.tool_call_id || "");
    if (!resourceSessionId || resourceSessionId !== this.options.resourceSessionId() || !toolCallId) return true;

    if (event.type === "tool.call") {
      if (this.pending.has(toolCallId) || this.responding.has(toolCallId) || this.completed.has(toolCallId))
        return true;
      const rpcId = String(payload.id || toolCallId);
      const runId = String(event.run_id || payload.run_id || "");
      const revision = Number(payload.revision || this.options.revision?.()) || 1;
      const toolName = String(payload.tool_name || payload.name || "");
      const rawArguments = payload.arguments ?? {};
      const argumentsValue = this.options.transformToolArguments?.(toolCallId, toolName, rawArguments) ?? rawArguments;
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id: rpcId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: argumentsValue,
          _meta: {
            [MCP_PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
            [MCP_CLIENT_CAPABILITIES_META_KEY]: {},
            [MCP_CLIENT_INFO_META_KEY]: { name: "luna", version: "1" },
            [AGENT_MCP_BINDING_META_KEY]: {
              resource_session_id: resourceSessionId,
              tool_call_id: toolCallId,
              revision
            }
          }
        }
      };
      this.options.sendFrame({
        type: "mcp.request",
        version: AGENT_PROTOCOL_VERSION,
        resource_session_id: resourceSessionId,
        data: request
      });
      this.pending.add(toolCallId);
      this.rpcToolCalls.set(rpcId, toolCallId);
      this.pendingCalls.set(toolCallId, { rpcId, runId, revision });
      return true;
    }

    if (this.completed.has(toolCallId)) return true;
    const pendingCall = this.pendingCalls.get(toolCallId);
    this.pending.delete(toolCallId);
    this.pendingCalls.delete(toolCallId);
    this.completed.delete(toolCallId);
    this.rememberCompleted(toolCallId, this.cancelled, this.cancelledOrder);
    const requestId = String(payload.request_id || payload.id || pendingCall?.rpcId || toolCallId);
    this.sendCancellation(
      resourceSessionId,
      toolCallId,
      requestId,
      payload.reason ? String(payload.reason) : "",
      pendingCall?.revision || this.options.revision?.() || 1
    );
    this.rpcToolCalls.set(requestId, toolCallId);
    return true;
  }

  cancelPending(reason: string) {
    const resourceSessionId = this.options.resourceSessionId();
    let sent = 0;
    for (const [toolCallId, call] of this.pendingCalls) {
      try {
        this.sendCancellation(resourceSessionId, toolCallId, call.rpcId, reason, call.revision);
        sent += 1;
      } catch {
        // Cancellation is best effort when the Koko transport is already gone.
      }
      this.pending.delete(toolCallId);
      this.pendingCalls.delete(toolCallId);
      this.rememberCompleted(toolCallId, this.cancelled, this.cancelledOrder);
    }
    return sent;
  }

  consumeKokoFrame(value: unknown): AgentToolRelayResult | null {
    const epoch = this.epoch;
    const frame = parseKokoMcpFrame(value);
    if (!frame || (frame.type !== "mcp.response" && frame.type !== "mcp.cancel_result")) return null;
    if (frame.resource_session_id !== this.options.resourceSessionId()) return null;

    const data = frame.data;
    const inlineToolCallId = isRecord(data) ? String(data.tool_call_id || "") : "";
    const rpcId = String(data.id);
    const correlatedToolCallId = this.rpcToolCalls.get(rpcId) || "";
    if (frame.type === "mcp.response" && !correlatedToolCallId) return null;
    const toolCallId =
      frame.type === "mcp.response"
        ? correlatedToolCallId
        : inlineToolCallId || correlatedToolCallId || rpcId.replace(/^cancel:/, "");
    if (!toolCallId) return null;

    if (frame.type === "mcp.cancel_result") {
      const controlKey = `${toolCallId}\u0000${rpcId}`;
      if (this.completedControls.has(controlKey) || this.respondingControls.has(controlKey)) return null;
      this.respondingControls.add(controlKey);
      return {
        toolCallId,
        payload: null,
        complete: (delivered) => {
          if (this.epoch !== epoch) return;
          this.respondingControls.delete(controlKey);
          if (!delivered) return;
          this.rememberCompleted(controlKey, this.completedControls, this.completedControlOrder);
        }
      };
    }

    if (this.cancelled.has(toolCallId)) {
      const controlKey = `result\u0000${toolCallId}\u0000${rpcId}`;
      if (this.completedControls.has(controlKey) || this.respondingControls.has(controlKey)) return null;
      this.respondingControls.add(controlKey);
      return {
        toolCallId,
        payload: null,
        complete: (delivered) => {
          if (this.epoch !== epoch) return;
          this.respondingControls.delete(controlKey);
          if (!delivered) return;
          this.pending.delete(toolCallId);
          this.pendingCalls.delete(toolCallId);
          this.completed.delete(toolCallId);
          this.rpcToolCalls.delete(rpcId);
          this.rememberCompleted(controlKey, this.completedControls, this.completedControlOrder);
        }
      };
    }

    if (this.completed.has(toolCallId) || this.responding.has(toolCallId)) return null;
    const hasResult = data.result !== undefined;
    const hasError = data.error !== undefined;
    if (hasResult === hasError) throw new Error("Koko MCP response must contain exactly one result or error");
    const pendingCall = this.pendingCalls.get(toolCallId);
    if (!pendingCall?.runId) throw new Error("Koko MCP response does not match an active agent run");
    const normalized = hasError
      ? { status: "error" as const, error: data.error as AgentToolResultRequest["error"] }
      : normalizeMcpResult(data.result);
    this.responding.add(toolCallId);

    return {
      toolCallId,
      payload: {
        jsonrpc: "2.0",
        id: toolCallId,
        run_id: pendingCall.runId,
        seq: 1,
        done: true,
        ...normalized
      },
      complete: (delivered) => {
        if (this.epoch !== epoch) return;
        this.responding.delete(toolCallId);
        if (!delivered) return;
        this.pending.delete(toolCallId);
        this.pendingCalls.delete(toolCallId);
        this.rpcToolCalls.delete(rpcId);
        if (this.cancelled.has(toolCallId)) return;
        this.rememberCompleted(toolCallId, this.completed, this.completedOrder);
      }
    };
  }

  reset() {
    this.epoch += 1;
    this.pending.clear();
    this.responding.clear();
    this.respondingControls.clear();
    this.rpcToolCalls.clear();
    this.pendingCalls.clear();
    this.completed.clear();
    this.completedOrder.length = 0;
    this.completedControls.clear();
    this.completedControlOrder.length = 0;
    this.cancelled.clear();
    this.cancelledOrder.length = 0;
  }

  private rememberCompleted(key: string, values: Set<string>, order: string[]) {
    if (values.has(key)) return;
    values.add(key);
    order.push(key);
    while (order.length > this.completedLimit) {
      const evicted = order.shift();
      if (evicted) values.delete(evicted);
    }
  }

  private sendCancellation(
    resourceSessionId: string,
    toolCallId: string,
    requestId: string,
    reason: string,
    revision: number
  ) {
    const request: JsonRpcCancelNotification = {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: {
        requestId,
        ...(reason ? { reason } : {}),
        _meta: {
          [MCP_PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
          [MCP_CLIENT_CAPABILITIES_META_KEY]: {},
          [MCP_CLIENT_INFO_META_KEY]: { name: "luna", version: "1" },
          [AGENT_MCP_BINDING_META_KEY]: {
            resource_session_id: resourceSessionId,
            tool_call_id: toolCallId,
            revision
          }
        }
      }
    };
    this.options.sendFrame({
      type: "mcp.cancel",
      version: AGENT_PROTOCOL_VERSION,
      resource_session_id: resourceSessionId,
      data: request
    });
  }
}
