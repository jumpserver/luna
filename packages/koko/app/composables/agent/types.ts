export const AGENT_PROTOCOL_VERSION = 1 as const;
export const AGENT_CAPABILITY_VERSION = 1 as const;
export const AGENT_SESSIONS_ROOT = "/koko/agent/sessions/";
export const AGENT_MCP_BINDING_META_KEY = "com.jumpserver/agent";
export const MCP_PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
export const MCP_CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
export const MCP_CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
export const MCP_PROTOCOL_VERSION = "2026-07-28";

export function agentVersionHeaders(resourceSessionId?: string) {
  return {
    "Agent-Protocol-Version": String(AGENT_PROTOCOL_VERSION),
    "Agent-Capability-Version": String(AGENT_CAPABILITY_VERSION),
    ...(resourceSessionId ? { "X-Resource-Session-ID": resourceSessionId } : {})
  };
}

export type AgentApprovalMode = "always" | "auto" | "never";
export type AgentDomain = "terminal" | "file";

export interface AgentMcpTool {
  name: string;
  title?: string;
  description?: string;
  icons?: Array<{ src: string; mimeType?: string; sizes?: string[]; theme?: string }>;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentMcpManifest {
  profile: AgentDomain;
  context?: Record<string, unknown>;
  resourceSessionId: string;
  revision: number;
  tools: AgentMcpTool[];
}

export interface AgentBootstrapResponse {
  csrf_token: string;
  expires_at: string | number;
  refresh_at: string | number;
  instance_id: string;
  protocol_version: string | number;
  capability_version: string | number;
  session_id?: string;
  cursor?: number;
  context_digest?: string;
  toolset_digest?: string;
}

export interface AgentSessionCreateRequest {
  profile: AgentDomain;
  context?: Record<string, unknown>;
  resource_session_id: string;
  revision: number;
  tools: AgentMcpTool[];
  approval_mode: AgentApprovalMode;
}

export interface AgentSessionCreateResponse {
  session_id: string;
  after: number;
}

export interface AgentMessageRequest {
  message_id: string;
  idempotency_key: string;
  role: "user";
  parts: Array<{ type: "text"; text: string }>;
  metadata?: Record<string, unknown>;
}

export interface AgentMessageResponse {
  message_id: string;
  run_id: string;
  duplicate?: boolean;
  cursor: number;
}

export type AgentApprovalDecision = "approve" | "reject";

export interface AgentApprovalRequest {
  decision: AgentApprovalDecision;
  run_id?: string;
  digest?: string;
}

export interface AgentApprovalModeRequest {
  mode: AgentApprovalMode;
}

export interface AgentToolResultRequest {
  jsonrpc: "2.0";
  id: string;
  run_id: string;
  seq: number;
  done: boolean;
  status: "running" | "success" | "error" | "cancelled" | "timeout";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type AgentEventType =
  | "session.created"
  | "session.closed"
  | "session.approval_mode_changed"
  | "message.created"
  | "message.delta"
  | "message.completed"
  | "run.queued"
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "run.interrupted"
  | "model.requested"
  | "model.completed"
  | "approval.requested"
  | "approval.resolved"
  | "tool.call"
  | "tool.cancel"
  | "tool.result"
  | "error"
  | "heartbeat"
  | "stream.reset";

export interface AgentEvent {
  seq: number;
  event_id?: string;
  type: AgentEventType;
  session_id?: string;
  resource_session_id?: string;
  run_id?: string;
  message_id?: string;
  approval_id?: string;
  tool_call_id?: string;
  timestamp?: number;
  payload?: Record<string, unknown>;
}

export interface AgentHistoryResponse {
  events: AgentEvent[];
  next_cursor: number;
  has_more: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: "tools/call";
  params: Record<string, unknown>;
}

export interface JsonRpcCancelNotification {
  jsonrpc: "2.0";
  method: "notifications/cancelled";
  params: {
    requestId: string;
    reason?: string;
    _meta: Record<string, unknown>;
  };
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface KokoMcpFrameBase {
  version: 1;
  resource_session_id: string;
}

export interface KokoMcpManifestFrame extends KokoMcpFrameBase {
  type: "mcp.manifest";
  data: {
    profile: AgentDomain;
    context?: Record<string, unknown>;
    revision: number;
    tools: AgentMcpTool[];
  };
}

export interface KokoMcpRequestFrame extends KokoMcpFrameBase {
  type: "mcp.request";
  data: JsonRpcRequest;
}

export interface KokoMcpResponseFrame extends KokoMcpFrameBase {
  type: "mcp.response";
  data: JsonRpcResponse;
}

export interface KokoMcpCancelFrame extends KokoMcpFrameBase {
  type: "mcp.cancel";
  data: JsonRpcCancelNotification;
}

export interface KokoMcpCancelResultFrame extends KokoMcpFrameBase {
  type: "mcp.cancel_result";
  data: JsonRpcResponse;
}

export type KokoMcpFrame =
  | KokoMcpManifestFrame
  | KokoMcpRequestFrame
  | KokoMcpResponseFrame
  | KokoMcpCancelFrame
  | KokoMcpCancelResultFrame;

export const KOKO_MCP_FRAME_TYPES = [
  "mcp.manifest",
  "mcp.request",
  "mcp.response",
  "mcp.cancel",
  "mcp.cancel_result"
] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseKokoMcpFrame(value: unknown): KokoMcpFrame | null {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type.startsWith("mcp.")) return null;
  let data: unknown = value.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  const dataRecord = isRecord(data) ? data : null;
  const version = Number(value.version ?? dataRecord?.version);
  const resourceSessionId = String(value.resource_session_id || dataRecord?.resource_session_id || "");
  if (version !== AGENT_PROTOCOL_VERSION || !resourceSessionId) return null;
  if (
    value.resource_session_id !== undefined &&
    dataRecord?.resource_session_id !== undefined &&
    value.resource_session_id !== dataRecord.resource_session_id
  ) {
    return null;
  }

  if (value.type === "mcp.manifest") {
    const manifest = dataRecord || value;
    if ((manifest.profile !== "terminal" && manifest.profile !== "file") || !Array.isArray(manifest.tools)) {
      return null;
    }
    if (manifest.context !== undefined && !isRecord(manifest.context)) return null;
    const revision = Number(manifest.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) return null;
    return {
      type: "mcp.manifest",
      version: AGENT_PROTOCOL_VERSION,
      resource_session_id: resourceSessionId,
      data: {
        profile: manifest.profile,
        ...(manifest.context ? { context: manifest.context } : {}),
        revision,
        tools: manifest.tools as AgentMcpTool[]
      }
    };
  }

  if (!dataRecord || !KOKO_MCP_FRAME_TYPES.includes(value.type as (typeof KOKO_MCP_FRAME_TYPES)[number])) return null;
  if (dataRecord.jsonrpc !== "2.0") return null;
  if (value.type === "mcp.request") {
    if (typeof dataRecord.id !== "string" || dataRecord.method !== "tools/call") return null;
  } else if (value.type === "mcp.cancel") {
    if (dataRecord.method !== "notifications/cancelled" || !isRecord(dataRecord.params)) return null;
    if (typeof dataRecord.params.requestId !== "string") return null;
  } else if (typeof dataRecord.id !== "string") {
    return null;
  }
  return {
    type: value.type,
    version: AGENT_PROTOCOL_VERSION,
    resource_session_id: resourceSessionId,
    data: dataRecord
  } as KokoMcpFrame;
}

export function kokoMcpWireMessage(frame: KokoMcpFrame) {
  return {
    type: frame.type,
    version: frame.version,
    resource_session_id: frame.resource_session_id,
    data: JSON.stringify(frame.data)
  };
}

export function manifestFromFrame(frame: KokoMcpManifestFrame): AgentMcpManifest {
  return {
    profile: frame.data.profile,
    ...(frame.data.context ? { context: frame.data.context } : {}),
    resourceSessionId: frame.resource_session_id,
    revision: frame.data.revision,
    tools: frame.data.tools
  };
}
