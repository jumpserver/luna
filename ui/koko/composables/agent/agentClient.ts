import type {
  AgentApprovalMode,
  AgentApprovalModeRequest,
  AgentApprovalRequest,
  AgentBootstrapResponse,
  AgentHistoryResponse,
  AgentMcpManifest,
  AgentMessageRequest,
  AgentMessageResponse,
  AgentSessionCreateResponse,
  AgentToolResultRequest
} from "./types";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { getWebApiHeaders, getWebApiMutationHeaders, isDesktopRuntime, withWebSitePrefix } from "~/utils/runtime";
import { normalizeAgentEvent } from "./agentSse";
import { AGENT_CAPABILITY_VERSION, AGENT_PROTOCOL_VERSION, KAEL_API_ROOT } from "./types";

export interface AgentHttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

type AgentRequest = <T>(request: AgentHttpRequest) => Promise<T>;

interface KaelBootstrap {
  cluster_id?: string;
  instance_id?: string;
  protocol_version: string | number;
  capability_version: string | number;
}

interface KaelConversation {
  id: string;
}

interface KaelPanel {
  id: string;
  cursor?: number;
  resume_token?: string;
}

interface KaelRegistry {
  registry_revision: number;
  registrations?: Array<{
    id?: string;
    client_key?: string;
    name?: string;
  }>;
}

interface KaelContext {
  version?: number;
}

interface KaelMessage {
  id: string;
}

interface KaelRun {
  id: string;
}

interface KaelDeliveryPage {
  events?: Array<Record<string, unknown>>;
  next_cursor?: number;
  has_more?: boolean;
}

interface AgentBinding {
  resourceSessionId: string;
  conversationId: string;
  panelId: string;
  activeRunId: string;
  surface: string;
  profile: string;
  contextVersion: number;
  heartbeat: ReturnType<typeof setInterval>;
}

export class AgentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody = ""
  ) {
    super(`Kael request failed with HTTP ${status}${responseBody ? `: ${responseBody}` : ""}`);
    this.name = "AgentHttpError";
  }
}

export class AgentInstanceChangedError extends Error {
  readonly code = "agent_instance_changed";

  constructor(expected: string, received: string) {
    super(`Kael instance changed for the resource session: expected ${expected}, received ${received}`);
    this.name = "AgentInstanceChangedError";
  }
}

async function defaultAgentRequest<T>(request: AgentHttpRequest): Promise<T> {
  if (isDesktopRuntime()) return desktopInvoke<T>("api_request", { request: { ...request, service: "kael" } });
  const hasBody = request.body !== undefined;
  const response = await fetch(withWebSitePrefix(request.path), {
    method: request.method,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...(request.method === "GET" ? getWebApiHeaders() : getWebApiMutationHeaders()),
      ...request.headers,
      ...(hasBody ? { "Content-Type": "application/json" } : {})
    },
    body: hasBody ? JSON.stringify(request.body) : undefined
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) throw new AgentHttpError(response.status, text);
  return data as T;
}

function sessionPath(sessionId: string, suffix = "") {
  const normalized = sessionId.trim();
  if (!normalized) throw new Error("Kael panel session id is required");
  return `${KAEL_API_ROOT}/panel-sessions/${encodeURIComponent(normalized)}${suffix ? `/${suffix}` : ""}`;
}

export class AgentClient {
  private readonly bootstraps = new Map<string, AgentBootstrapResponse>();
  private readonly instanceByResource = new Map<string, string>();
  private readonly usersByResource = new Map<string, number>();
  private readonly bindings = new Map<string, AgentBinding>();

  constructor(private readonly request: AgentRequest = defaultAgentRequest) {}

  retainResource(resourceSessionId: string) {
    this.usersByResource.set(resourceSessionId, (this.usersByResource.get(resourceSessionId) || 0) + 1);
  }

  releaseResource(resourceSessionId: string) {
    const users = Math.max(0, (this.usersByResource.get(resourceSessionId) || 0) - 1);
    if (users) {
      this.usersByResource.set(resourceSessionId, users);
      return false;
    }
    this.usersByResource.delete(resourceSessionId);
    this.bootstraps.delete(resourceSessionId);
    this.instanceByResource.delete(resourceSessionId);
    return true;
  }

  async bootstrap(resourceSessionId: string, force = false): Promise<AgentBootstrapResponse> {
    const resourceId = resourceSessionId.trim();
    if (!resourceId) throw new Error("Resource session id is required for Kael bootstrap");
    const cached = this.bootstraps.get(resourceId);
    if (cached && !force) return cached;
    const response = await this.request<KaelBootstrap>({ method: "GET", path: `${KAEL_API_ROOT}/bootstrap` });
    const instanceId = String(response.cluster_id || response.instance_id || "");
    if (!instanceId) throw new Error("Kael bootstrap did not return an instance id");
    const previous = this.instanceByResource.get(resourceId);
    if (previous && previous !== instanceId) throw new AgentInstanceChangedError(previous, instanceId);
    if (String(response.protocol_version) !== String(AGENT_PROTOCOL_VERSION)) {
      throw new Error(`Unsupported Kael protocol version: ${response.protocol_version}`);
    }
    if (String(response.capability_version) !== String(AGENT_CAPABILITY_VERSION)) {
      throw new Error(`Unsupported Kael capability version: ${response.capability_version}`);
    }
    const value: AgentBootstrapResponse = {
      csrf_token: "",
      expires_at: Number.MAX_SAFE_INTEGER,
      refresh_at: Number.MAX_SAFE_INTEGER,
      instance_id: instanceId,
      protocol_version: response.protocol_version,
      capability_version: response.capability_version
    };
    this.instanceByResource.set(resourceId, instanceId);
    this.bootstraps.set(resourceId, value);
    return value;
  }

  async createSession(
    manifest: AgentMcpManifest,
    approvalMode: AgentApprovalMode
  ): Promise<AgentSessionCreateResponse> {
    await this.bootstrap(manifest.resourceSessionId);
    const surface = `session.${manifest.profile}`;
    const conversation = await this.request<KaelConversation>({
      method: "POST",
      path: `${KAEL_API_ROOT}/conversations`,
      body: {
        kind: "capability",
        assistant: manifest.profile,
        profile: manifest.profile,
        surface,
        metadata: { resource_session_id: manifest.resourceSessionId }
      }
    });
    let panel: KaelPanel | null = null;
    try {
      panel = await this.request<KaelPanel>({
        method: "POST",
        path: `${KAEL_API_ROOT}/panel-sessions`,
        body: {
          conversation_id: conversation.id,
          surface,
          profile: manifest.profile,
          client_instance_id: manifest.resourceSessionId,
          approval_mode: approvalMode
        }
      });
      let contextVersion = 0;
      if (manifest.context) {
        const context = await this.request<KaelContext>({
          method: "PUT",
          path: sessionPath(panel.id, "context"),
          body: {
            base_version: 0,
            domain: manifest.profile,
            surface,
            sensitivity: "restricted",
            data: manifest.context
          }
        });
        contextVersion = Math.max(0, Math.floor(Number(context.version) || 1));
      }
      const registry = await this.request<KaelRegistry>({
        method: "PUT",
        path: sessionPath(panel.id, "registrations"),
        body: {
          base_registry_revision: 0,
          registrations: manifest.tools.map((tool) => ({
            client_key: tool.name,
            name: tool.name,
            description: tool.description || tool.title || "",
            input_schema: tool.inputSchema,
            ...(tool.outputSchema ? { output_schema: tool.outputSchema } : {}),
            definition_version: String(manifest.revision),
            annotations: tool.annotations || {},
            _meta: tool._meta || {}
          }))
        }
      });
      const heartbeat = setInterval(() => {
        void this.request({ method: "POST", path: sessionPath(panel!.id, "heartbeat") }).catch(() => undefined);
      }, 60_000);
      this.bindings.set(panel.id, {
        resourceSessionId: manifest.resourceSessionId,
        conversationId: conversation.id,
        panelId: panel.id,
        activeRunId: "",
        surface,
        profile: manifest.profile,
        contextVersion,
        heartbeat
      });
      const registrationIds = Object.fromEntries(
        (registry.registrations || []).flatMap((registration) => {
          const clientKey = String(registration.client_key || registration.name || "");
          const registrationId = String(registration.id || "");
          return clientKey && registrationId ? [[clientKey, registrationId]] : [];
        })
      );
      return {
        session_id: panel.id,
        after: 0,
        ...(Object.keys(registrationIds).length ? { registration_ids: registrationIds } : {})
      };
    } catch (error) {
      if (panel?.id) await this.request({ method: "DELETE", path: sessionPath(panel.id) }).catch(() => undefined);
      await this.request({ method: "DELETE", path: `${KAEL_API_ROOT}/conversations/${conversation.id}` }).catch(
        () => undefined
      );
      throw error;
    }
  }

  async sendMessage(
    sessionId: string,
    resourceSessionId: string,
    message: AgentMessageRequest
  ): Promise<AgentMessageResponse> {
    const binding = this.binding(sessionId, resourceSessionId);
    const created = await this.request<KaelMessage>({
      method: "POST",
      path: `${KAEL_API_ROOT}/conversations/${binding.conversationId}/messages`,
      body: {
        id: message.message_id,
        idempotency_key: message.idempotency_key,
        role: message.role,
        parts: message.parts
      }
    });
    const run = await this.request<KaelRun>({
      method: "POST",
      path: `${KAEL_API_ROOT}/runs`,
      body: {
        conversation_id: binding.conversationId,
        input_message_id: created.id,
        panel_session_id: binding.panelId,
        execution_mode: "foreground",
        capability_mode: "panel",
        idempotency_key: `run:${message.idempotency_key}`
      }
    });
    binding.activeRunId = run.id;
    return { message_id: created.id, run_id: run.id, cursor: 0 };
  }

  async updateContext(sessionId: string, resourceSessionId: string, context: Record<string, unknown>) {
    const binding = this.binding(sessionId, resourceSessionId);
    const response = await this.request<KaelContext>({
      method: "PUT",
      path: sessionPath(binding.panelId, "context"),
      body: {
        base_version: binding.contextVersion,
        domain: binding.profile,
        surface: binding.surface,
        sensitivity: "restricted",
        data: context
      }
    });
    binding.contextVersion = Math.max(binding.contextVersion + 1, Math.floor(Number(response.version) || 0));
  }

  async resolveApproval(
    sessionId: string,
    resourceSessionId: string,
    approvalId: string,
    request: AgentApprovalRequest
  ) {
    this.binding(sessionId, resourceSessionId);
    await this.request({
      method: "POST",
      path: `${KAEL_API_ROOT}/approvals/${encodeURIComponent(approvalId)}/decisions`,
      body: {
        decision: request.decision,
        ...(request.run_id ? { run_id: request.run_id } : {}),
        ...(request.digest ? { arguments_digest: request.digest } : {})
      }
    });
  }

  async setApprovalMode(sessionId: string, resourceSessionId: string, request: AgentApprovalModeRequest) {
    this.binding(sessionId, resourceSessionId);
    await this.request({
      method: "PATCH",
      path: sessionPath(sessionId, "approval-mode"),
      body: request
    });
  }

  async sendToolResult(
    sessionId: string,
    resourceSessionId: string,
    toolCallId: string,
    result: AgentToolResultRequest
  ) {
    const binding = this.binding(sessionId, resourceSessionId);
    await this.request({
      method: "POST",
      path: `${KAEL_API_ROOT}/tool-calls/${encodeURIComponent(toolCallId)}/results`,
      body: {
        run_id: result.run_id,
        panel_session_id: binding.panelId,
        seq: result.seq,
        done: result.done,
        status: result.status,
        ...(result.result !== undefined ? { result: result.result } : {}),
        ...(result.error !== undefined ? { error: result.error } : {})
      }
    });
  }

  async history(sessionId: string, resourceSessionId: string, after = 0): Promise<AgentHistoryResponse> {
    this.binding(sessionId, resourceSessionId);
    const response = await this.request<KaelDeliveryPage>({
      method: "GET",
      path: `${sessionPath(sessionId, "events")}?after=${Math.max(0, Math.floor(after))}&once=true&limit=256`
    });
    const events = (response.events || []).flatMap((event) => {
      const normalized = normalizeAgentEvent(event);
      return normalized ? [normalized] : [];
    });
    return {
      events,
      next_cursor: Number(response.next_cursor) || after,
      has_more: Boolean(response.has_more)
    };
  }

  async cancel(sessionId: string, resourceSessionId: string, runId = "", reason = "user") {
    const binding = this.binding(sessionId, resourceSessionId);
    const target = runId || binding.activeRunId;
    if (!target) return;
    await this.request({
      method: "POST",
      path: `${KAEL_API_ROOT}/runs/${encodeURIComponent(target)}/cancel`,
      body: { reason }
    });
    if (binding.activeRunId === target) binding.activeRunId = "";
  }

  async deleteSession(sessionId: string, resourceSessionId: string) {
    const normalized = sessionId.trim();
    if (!normalized) return;
    const binding = this.bindings.get(normalized);
    if (binding && binding.resourceSessionId !== resourceSessionId) return;
    if (binding) clearInterval(binding.heartbeat);
    this.bindings.delete(normalized);
    try {
      await this.request({ method: "DELETE", path: sessionPath(normalized) });
    } catch (error) {
      if (error instanceof AgentHttpError && [404, 410].includes(error.status)) return;
      throw error;
    }
  }

  dispose() {
    for (const binding of this.bindings.values()) clearInterval(binding.heartbeat);
    this.bindings.clear();
    this.bootstraps.clear();
    this.instanceByResource.clear();
    this.usersByResource.clear();
  }

  private binding(sessionId: string, resourceSessionId: string) {
    const binding = this.bindings.get(sessionId);
    if (!binding || binding.resourceSessionId !== resourceSessionId) {
      throw new Error("Kael panel session binding is unavailable");
    }
    return binding;
  }
}

export const agentClient = new AgentClient();
