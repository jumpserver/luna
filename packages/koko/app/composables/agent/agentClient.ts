import type {
  AgentApprovalModeRequest,
  AgentApprovalRequest,
  AgentBootstrapResponse,
  AgentHistoryResponse,
  AgentMcpManifest,
  AgentMessageRequest,
  AgentMessageResponse,
  AgentSessionCreateResponse,
  AgentToolResultRequest,
  AgentApprovalMode
} from "./types";
import { desktopInvoke } from "~/shared/desktop/bridge";
import { getWebApiHeaders, isDesktopRuntime, withWebSitePrefix } from "~/utils/runtime";
import { agentVersionHeaders, AGENT_CAPABILITY_VERSION, AGENT_PROTOCOL_VERSION, AGENT_SESSIONS_ROOT } from "./types";

export interface AgentHttpRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

type AgentRequest = <T>(request: AgentHttpRequest) => Promise<T>;

const REFRESH_OVERLAP_MS = 5 * 60_000;
const REFRESH_RETRY_MS = 30_000;

export class AgentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody = ""
  ) {
    super(`Agent request failed with HTTP ${status}${responseBody ? `: ${responseBody}` : ""}`);
    this.name = "AgentHttpError";
  }
}

export class AgentInstanceChangedError extends Error {
  readonly code = "agent_instance_changed";

  constructor(expected: string, received: string) {
    super(`Agent instance changed for the resource session: expected ${expected}, received ${received}`);
    this.name = "AgentInstanceChangedError";
  }
}

function responseStatus(error: unknown) {
  if (error instanceof AgentHttpError) return error.status;
  if (typeof error === "object" && error && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (Number.isInteger(status)) return status;
  }
  const match = String(error instanceof Error ? error.message : error).match(/(?:HTTP\s+|status=)(\d{3})/i);
  return match ? Number(match[1]) : 0;
}

function sessionPath(sessionId: string, suffix: string) {
  const normalized = sessionId.trim();
  if (!normalized) throw new Error("Agent session id is required");
  return `${AGENT_SESSIONS_ROOT}${encodeURIComponent(normalized)}/${suffix}`;
}

function timestampMs(value: string | number) {
  if (typeof value === "number") return value < 1_000_000_000_000 ? value * 1000 : value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  return Date.parse(value);
}

async function defaultAgentRequest<T>(request: AgentHttpRequest): Promise<T> {
  if (isDesktopRuntime()) return desktopInvoke<T>("api_request", { request: { ...request, service: "agent" } });
  const hasBody = request.body !== undefined;
  const response = await fetch(withWebSitePrefix(request.path), {
    method: request.method,
    cache: "no-store",
    credentials: "include",
    headers: {
      ...getWebApiHeaders(),
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
  if (!response.ok) throw new AgentHttpError(response.status, String(text));
  return data as T;
}

export class AgentClient {
  private readonly bootstraps = new Map<
    string,
    {
      value: AgentBootstrapResponse | null;
      instanceId: string;
      promise: Promise<AgentBootstrapResponse> | null;
      timer: ReturnType<typeof setTimeout> | null;
      users: number;
      releasePending: boolean;
    }
  >();

  constructor(private readonly request: AgentRequest = defaultAgentRequest) {}

  retainResource(resourceSessionId: string) {
    const entry = this.bootstrapEntry(resourceSessionId);
    entry.releasePending = false;
    entry.users += 1;
  }

  releaseResource(resourceSessionId: string) {
    const entry = this.bootstraps.get(resourceSessionId);
    if (!entry) return;
    entry.users = Math.max(0, entry.users - 1);
    if (entry.users) return;
    if (entry.promise) {
      entry.releasePending = true;
      return;
    }
    if (entry.timer) clearTimeout(entry.timer);
    this.bootstraps.delete(resourceSessionId);
  }

  async bootstrap(resourceSessionId: string, force = false) {
    const resourceId = resourceSessionId.trim();
    if (!resourceId) throw new Error("Resource session id is required for Agent bootstrap");
    const entry = this.bootstrapEntry(resourceId);
    if (!force && entry.value && !this.shouldRefresh(entry.value)) return entry.value;
    if (entry.promise) return entry.promise;

    const previousToken = force ? entry.value?.csrf_token : undefined;
    const issue = (csrfToken?: string) =>
      this.request<AgentBootstrapResponse>({
        method: "GET",
        path: `${AGENT_SESSIONS_ROOT}bootstrap`,
        headers: {
          ...agentVersionHeaders(resourceId),
          ...(csrfToken ? { "X-Koko-Agent-CSRF": csrfToken } : {})
        }
      });

    entry.promise = issue(previousToken)
      .catch((error) => {
        if (!previousToken || responseStatus(error) !== 403) throw error;
        this.clearBootstrapValue(resourceId, previousToken);
        return issue();
      })
      .then((response) => {
        if (!response?.csrf_token) throw new Error("Agent bootstrap did not return a CSRF token");
        const instanceId = String(response.instance_id || "");
        if (!instanceId) throw new Error("Agent bootstrap did not return an instance id");
        if (entry.instanceId && entry.instanceId !== instanceId) {
          throw new AgentInstanceChangedError(entry.instanceId, instanceId);
        }
        if (String(response.protocol_version) !== String(AGENT_PROTOCOL_VERSION)) {
          throw new Error(`Unsupported Agent protocol version: ${response.protocol_version}`);
        }
        if (String(response.capability_version) !== String(AGENT_CAPABILITY_VERSION)) {
          throw new Error(`Unsupported Agent capability version: ${response.capability_version}`);
        }
        entry.instanceId = instanceId;
        entry.value = response;
        this.scheduleRefresh(resourceId, response);
        return response;
      })
      .finally(() => {
        entry.promise = null;
        if (entry.releasePending && !entry.users && this.bootstraps.get(resourceId) === entry) {
          if (entry.timer) clearTimeout(entry.timer);
          this.bootstraps.delete(resourceId);
        }
      });
    return entry.promise;
  }

  async createSession(manifest: AgentMcpManifest, approvalMode: AgentApprovalMode) {
    return this.write<AgentSessionCreateResponse>(
      {
        method: "POST",
        path: AGENT_SESSIONS_ROOT,
        body: {
          profile: manifest.profile,
          ...(manifest.context ? { context: manifest.context } : {}),
          resource_session_id: manifest.resourceSessionId,
          revision: manifest.revision,
          tools: manifest.tools,
          approval_mode: approvalMode
        }
      },
      manifest.resourceSessionId
    );
  }

  sendMessage(sessionId: string, resourceSessionId: string, message: AgentMessageRequest) {
    return this.write<AgentMessageResponse>(
      {
        method: "POST",
        path: sessionPath(sessionId, "messages"),
        body: message
      },
      resourceSessionId
    );
  }

  resolveApproval(sessionId: string, resourceSessionId: string, approvalId: string, request: AgentApprovalRequest) {
    return this.write<void>(
      {
        method: "POST",
        path: sessionPath(sessionId, `approvals/${encodeURIComponent(approvalId)}`),
        body: request
      },
      resourceSessionId
    );
  }

  setApprovalMode(sessionId: string, resourceSessionId: string, request: AgentApprovalModeRequest) {
    return this.write<void>(
      {
        method: "POST",
        path: sessionPath(sessionId, "approval-mode"),
        body: request
      },
      resourceSessionId
    );
  }

  sendToolResult(sessionId: string, resourceSessionId: string, toolCallId: string, result: AgentToolResultRequest) {
    return this.write<void>(
      {
        method: "POST",
        path: sessionPath(sessionId, `tool-results/${encodeURIComponent(toolCallId)}`),
        body: result
      },
      resourceSessionId
    );
  }

  history(sessionId: string, resourceSessionId: string, after = 0) {
    const query = new URLSearchParams({ after: String(Math.max(0, Math.floor(after))), limit: "256" });
    return this.request<AgentHistoryResponse>({
      method: "GET",
      path: `${sessionPath(sessionId, "history")}?${query}`,
      headers: agentVersionHeaders(resourceSessionId)
    });
  }

  cancel(sessionId: string, resourceSessionId: string, runId = "", reason = "user") {
    return this.write<void>(
      {
        method: "POST",
        path: sessionPath(sessionId, "cancel"),
        body: { ...(runId ? { run_id: runId } : {}), ...(reason ? { reason } : {}) }
      },
      resourceSessionId
    );
  }

  async deleteSession(sessionId: string, resourceSessionId: string) {
    const normalized = sessionId.trim();
    if (!normalized) return;
    try {
      await this.write<void>(
        { method: "DELETE", path: `${AGENT_SESSIONS_ROOT}${encodeURIComponent(normalized)}` },
        resourceSessionId
      );
    } catch (error) {
      if ([404, 410].includes(responseStatus(error))) return;
      throw error;
    }
  }

  dispose() {
    for (const entry of this.bootstraps.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.bootstraps.clear();
  }

  private async write<T>(request: AgentHttpRequest, resourceSessionId: string) {
    const bootstrap = await this.bootstrap(resourceSessionId);
    const issue = (csrfToken: string) =>
      this.request<T>({
        ...request,
        headers: {
          ...request.headers,
          ...agentVersionHeaders(resourceSessionId),
          "X-Koko-Agent-CSRF": csrfToken
        }
      });
    try {
      return await issue(bootstrap.csrf_token);
    } catch (error) {
      if (responseStatus(error) !== 403) throw error;
      this.clearBootstrapValue(resourceSessionId, bootstrap.csrf_token);
      const refreshed = await this.bootstrap(resourceSessionId);
      return issue(refreshed.csrf_token);
    }
  }

  private shouldRefresh(bootstrap: AgentBootstrapResponse) {
    const refreshAt = timestampMs(bootstrap.refresh_at);
    const expiresAt = timestampMs(bootstrap.expires_at);
    const deadline = Math.min(refreshAt, expiresAt - REFRESH_OVERLAP_MS);
    return !Number.isFinite(deadline) || Date.now() >= deadline;
  }

  private bootstrapEntry(resourceSessionId: string) {
    const existing = this.bootstraps.get(resourceSessionId);
    if (existing) return existing;
    const entry = { value: null, instanceId: "", promise: null, timer: null, users: 0, releasePending: false } as {
      value: AgentBootstrapResponse | null;
      instanceId: string;
      promise: Promise<AgentBootstrapResponse> | null;
      timer: ReturnType<typeof setTimeout> | null;
      users: number;
      releasePending: boolean;
    };
    this.bootstraps.set(resourceSessionId, entry);
    return entry;
  }

  private clearBootstrapValue(resourceSessionId: string, csrfToken: string) {
    const entry = this.bootstraps.get(resourceSessionId);
    if (!entry || entry.value?.csrf_token !== csrfToken) return;
    entry.value = null;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
  }

  private scheduleRefresh(resourceSessionId: string, bootstrap: AgentBootstrapResponse) {
    const entry = this.bootstrapEntry(resourceSessionId);
    if (entry.timer) clearTimeout(entry.timer);
    const refreshAt = timestampMs(bootstrap.refresh_at);
    const expiresAt = timestampMs(bootstrap.expires_at);
    const deadline = Math.min(refreshAt, expiresAt - REFRESH_OVERLAP_MS);
    const delay = Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : REFRESH_RETRY_MS;
    entry.timer = setTimeout(() => this.refresh(resourceSessionId), delay);
  }

  private refresh(resourceSessionId: string) {
    const entry = this.bootstraps.get(resourceSessionId);
    if (!entry) return;
    entry.timer = null;
    void this.bootstrap(resourceSessionId, true).catch(() => {
      if (this.bootstraps.get(resourceSessionId) !== entry) return;
      entry.timer = setTimeout(() => this.refresh(resourceSessionId), REFRESH_RETRY_MS);
    });
  }
}

export const agentClient = new AgentClient();
