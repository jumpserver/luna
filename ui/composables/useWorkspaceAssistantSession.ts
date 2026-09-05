import type { UseChatHelpers } from "@ai-sdk/vue";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import type { EffectScope } from "vue";
import type {
  AgentApprovalDecision,
  AgentApprovalMode,
  AgentMcpManifest,
  KokoMcpCancelFrame,
  KokoMcpCancelResultFrame,
  KokoMcpRequestFrame,
  KokoMcpResponseFrame
} from "#koko/composables/agent/types";
import type { AgentSessionController } from "#koko/composables/agent/useAgentSession";
import type { ConnectionFormInfo } from "~/composables/useAssetConnection";
import type { AssetItem, ConnectionInfo, PermedAccount, PermedProtocol } from "~/types";
import { useChat } from "@ai-sdk/vue";
import { effectScope, markRaw, reactive, shallowReactive } from "vue";
import {
  agentChatEventLifecycle,
  agentChatStreamMessage,
  agentChatTextId,
  closeAgentChatText
} from "#koko/composables/agent/agentChatStream";
import { AgentToolRelay } from "#koko/composables/agent/agentToolRelay";
import {
  AGENT_MCP_BINDING_META_KEY,
  AGENT_PROTOCOL_VERSION,
  isRecord,
  MCP_FINAL_RESULT_META_KEY
} from "#koko/composables/agent/types";
import { useAgentSession } from "#koko/composables/agent/useAgentSession";
import { getAssetDetailRequest } from "~/composables/useApiRequest";
import { useConnectionLauncher } from "~/composables/useConnectionLauncher";
import { useWorkspaceTabs } from "~/composables/useWorkspaceTabs";
import { useWorkspaceUiAutomation } from "~/composables/useWorkspaceUiAutomation";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

export const DEFAULT_WORKSPACE_ASSISTANT_SCOPE = "global";
const WORKSPACE_TOOL_REVISION = 1;
const CONNECTION_PLAN_TTL_MS = 5 * 60_000;
const CONNECTION_PLAN_LIMIT = 8;
const COMPLETED_INVOCATION_LIMIT = 256;

export type WorkspaceAssistantEventData = Record<string, any>;
export type WorkspaceAssistantChatMessage = UIMessage<
  WorkspaceAssistantEventData,
  Record<string, WorkspaceAssistantEventData>
>;

interface WorkspaceConnectionPlan {
  id: string;
  digest: string;
  expiresAt: number;
  organizationId: string;
  contextKey: string;
  uiRevision: number;
  assetId: string;
  assetName: string;
  protocol: string;
  accountIdentity: string;
  personalCredentialIdentity: string;
  state: "ready" | "connecting" | "consumed";
}

interface WorkspaceSearchGuard {
  candidateIds: Set<string>;
  candidateCount: number;
  ambiguityPending: boolean;
}

export function workspaceAssistantSearchDecision(ambiguityPending: boolean, candidateCount: number) {
  const count = Math.max(0, Math.floor(candidateCount));
  const pending = ambiguityPending || count > 1;
  return {
    ambiguityPending: pending,
    selectionRequired: pending,
    status: count === 0 ? "no_matches" : pending ? "selection_required" : "match_found"
  } as const;
}

export function workspaceAssistantNeedsAssetSelection(
  guard: Pick<WorkspaceSearchGuard, "ambiguityPending" | "candidateCount">,
  hasValidUserSelection: boolean
) {
  return (guard.ambiguityPending || guard.candidateCount > 1) && !hasValidUserSelection;
}

export function workspaceAssistantPlanExpired(expiresAt: number, now = Date.now()) {
  return expiresAt <= now;
}

export function workspaceAssistantClaimConnectionPlan(plan: { state: string }) {
  if (plan.state !== "ready") return false;
  plan.state = "connecting";
  return true;
}

export function workspaceAssistantPreparationInvalidReason(input: {
  aborted: boolean;
  expectedOrganizationId: string;
  currentOrganizationId: string;
  expectedContextKey: string;
  currentContextKey: string;
  expectedUiRevision: number;
  currentUiRevision: number;
}) {
  if (input.aborted) return "aborted";
  if (input.currentOrganizationId !== input.expectedOrganizationId) return "organization_changed";
  if (input.currentContextKey !== input.expectedContextKey) return "context_changed";
  if (input.currentUiRevision !== input.expectedUiRevision) return "stale_ui";
  return "";
}

interface WorkspaceInvocation {
  fingerprint: string;
  promise: Promise<Record<string, unknown>>;
}

interface WorkspaceToolRuntime {
  automation: ReturnType<typeof useWorkspaceUiAutomation>;
  launcher: ReturnType<typeof useConnectionLauncher>;
  tabs: ReturnType<typeof useWorkspaceTabs>;
  userInfoStore: ReturnType<typeof useUserInfoStore>;
  plans: Map<string, WorkspaceConnectionPlan>;
  invocations: Map<string, WorkspaceInvocation>;
  invocationOrder: string[];
  activeCalls: Map<string, AbortController>;
  searchGuard: WorkspaceSearchGuard;
}

interface WorkspaceAssistantRuntime {
  automation: ReturnType<typeof useWorkspaceUiAutomation>;
  launcher: ReturnType<typeof useConnectionLauncher>;
  tabs: ReturnType<typeof useWorkspaceTabs>;
  userInfoStore: ReturnType<typeof useUserInfoStore>;
}

export interface WorkspaceAssistantSession {
  kind: "workspace";
  scopeId: string;
  organizationId: string;
  contextKey: string;
  agent: AgentSessionController;
  chat: UseChatHelpers<WorkspaceAssistantChatMessage>;
  enabled: boolean;
  approvalMode: AgentApprovalMode;
  inputLocked: boolean;
  taskActive: boolean;
  draft: string;
  runtimeState: string;
  errorCode: string;
  errorText: string;
}

export function workspaceAssistantMessages(session: Pick<WorkspaceAssistantSession, "chat"> | null | undefined) {
  return session ? [...session.chat.messages.value] : [];
}

class WorkspaceAssistantError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WorkspaceAssistantError";
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

class WorkspaceAssistantTransport implements ChatTransport<WorkspaceAssistantChatMessage> {
  private activeResponse: ActiveResponse | null = null;
  private readonly pendingDispatches: PendingChatDispatch[] = [];

  constructor(private readonly getSession: () => WorkspaceAssistantSession) {}

  sendMessages: ChatTransport<WorkspaceAssistantChatMessage>["sendMessages"] = async ({ messages, abortSignal }) => {
    const dispatch = this.pendingDispatches.shift();
    const session = this.getSession();
    if (!session.enabled || !session.agent.state.available) {
      const error = new WorkspaceAssistantError("unavailable", "Workspace Assistant is unavailable");
      dispatch?.reject(error);
      throw error;
    }
    if (this.activeResponse) {
      const error = new WorkspaceAssistantError("response_active", "Another Workspace Assistant request is active");
      dispatch?.reject(error);
      throw error;
    }

    const message = messages.at(-1);
    if (!message || message.role !== "user") {
      const error = new WorkspaceAssistantError("invalid_message", "Workspace Assistant requires a user message");
      dispatch?.reject(error);
      throw error;
    }

    let response: ActiveResponse | null = null;
    try {
      let controller!: ReadableStreamDefaultController<UIMessageChunk>;
      const stream = new ReadableStream<UIMessageChunk>({
        start(streamController) {
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
      if (abortSignal?.aborted) throw new DOMException("Workspace Assistant request was aborted", "AbortError");

      session.taskActive = true;
      await session.agent.actions.sendMessage({
        ...message,
        metadata: { ...message.metadata, domain: "workspace", targetId: session.scopeId }
      });
      dispatch?.resolve();
      return stream;
    } catch (cause) {
      const error =
        cause instanceof WorkspaceAssistantError
          ? cause
          : new WorkspaceAssistantError(
              "send_failed",
              cause instanceof Error ? cause.message : "Failed to send Workspace Assistant request"
            );
      dispatch?.reject(error);
      if (response) this.fail(response, error);
      throw error;
    }
  };

  reconnectToStream: ChatTransport<WorkspaceAssistantChatMessage>["reconnectToStream"] = async () => null;

  receive(message: WorkspaceAssistantChatMessage) {
    const response = this.activeResponse;
    if (!response || message.role !== "assistant") return false;
    if (!response.started) {
      response.controller.enqueue({ type: "start", messageId: message.id, messageMetadata: message.metadata });
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
    const error = new WorkspaceAssistantError("unavailable", "Workspace Assistant session disconnected");
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

const sessions = shallowReactive(new Map<string, WorkspaceAssistantSession>());
const transports = new WeakMap<WorkspaceAssistantSession, WorkspaceAssistantTransport>();
const chatScopes = new WeakMap<WorkspaceAssistantSession, EffectScope>();
const runtimes = new WeakMap<WorkspaceAssistantSession, WorkspaceToolRuntime>();

export function useWorkspaceAssistantRuntime(): WorkspaceAssistantRuntime {
  return {
    automation: useWorkspaceUiAutomation(),
    launcher: useConnectionLauncher(),
    tabs: useWorkspaceTabs(),
    userInfoStore: useUserInfoStore()
  };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
};

const readOnlyNonIdempotentAnnotations = {
  ...readOnlyAnnotations,
  idempotentHint: false
};

export function workspaceAssistantManifest(
  resourceSessionId: string,
  context: { scopeId: string; organizationId: string; uiRevision: number }
): AgentMcpManifest {
  return {
    profile: "workspace",
    resourceSessionId,
    revision: WORKSPACE_TOOL_REVISION,
    context: {
      session_kind: "workspace",
      interaction_mode: "assist_navigation_and_connection",
      scope_id: context.scopeId,
      organization_id: context.organizationId,
      ui_revision: context.uiRevision
    },
    tools: [
      {
        name: "search_connectable_assets",
        title: "Search connectable assets",
        description:
          "Search only assets authorized for the current user and mirror the search in the Luna asset tree. Never choose one candidate when multiple assets are returned.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, maxLength: 256 },
            limit: { type: "integer", minimum: 1, maximum: 20, default: 10 }
          }
        },
        annotations: readOnlyAnnotations
      },
      {
        name: "reveal_asset",
        title: "Reveal an asset",
        description:
          "Navigate to the asset workspace and reveal an authorized asset in the asset tree. This does not choose connection parameters or start a connection.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["asset_id"],
          properties: {
            asset_id: { type: "string", minLength: 1, maxLength: 128 },
            query: { type: "string", maxLength: 256 }
          }
        },
        annotations: readOnlyAnnotations
      },
      {
        name: "prepare_asset_connection",
        title: "Prepare an asset connection",
        description:
          "Revalidate one authorized asset. If its asset, protocol, and account choice is unique, create a short-lived local connection plan. Otherwise open Luna's prefilled setup UI and require the user to choose. Never return credentials.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["asset_id"],
          properties: {
            asset_id: { type: "string", minLength: 1, maxLength: 128 }
          }
        },
        annotations: readOnlyNonIdempotentAnnotations
      },
      {
        name: "connect_asset",
        title: "Connect an asset",
        description:
          "Consume an unexpired Luna-local connection plan after explicit approval and ask Luna's existing connection launcher to start the session. A successful result means only that the Luna session started, not that remote authentication or login completed. A plan is single-use and cannot be replayed.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["plan_id", "plan_digest", "asset_id", "protocol"],
          properties: {
            plan_id: { type: "string", minLength: 1, maxLength: 160 },
            plan_digest: { type: "string", minLength: 16, maxLength: 160 },
            asset_id: { type: "string", minLength: 1, maxLength: 128 },
            asset_name: { type: "string", maxLength: 256 },
            protocol: { type: "string", minLength: 1, maxLength: 64 }
          }
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        },
        _meta: { [MCP_FINAL_RESULT_META_KEY]: true }
      }
    ]
  };
}

function boundedString(value: unknown, maximum: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maximum);
}

function opaqueId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function workspaceAssistantScopeId() {
  return opaqueId("workspace-scope");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function connectionPlanDigest(value: Record<string, unknown>) {
  const nonce = opaqueId("nonce");
  const input = new TextEncoder().encode(stableJson({ ...value, nonce }));
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // Desktop and supported browsers provide WebCrypto. This opaque verifier is
  // only a compatibility fallback and is still checked against the local plan.
  return opaqueId("workspace-verifier");
}

function choiceValue(value: unknown) {
  if (typeof value === "string") return value;
  if (isRecord(value)) return boundedString(value.name || value.value || value.label, 256);
  return "";
}

function normalizeCandidate(value: unknown) {
  if (!isRecord(value)) return null;
  const id = boundedString(value.id || value.assetId || value.asset_id, 128);
  if (!id) return null;
  return {
    id,
    name: boundedString(value.name, 256),
    address: boundedString(value.address, 256),
    platform: choiceValue(value.platform),
    zone: choiceValue(value.zone),
    category: choiceValue(value.category),
    type: choiceValue(value.type),
    is_active: value.isActive !== false && value.is_active !== false
  };
}

function uniqueProtocols(protocols: PermedProtocol[]) {
  const names = protocols
    .filter((protocol) => protocol?.name !== "winrm" && (isDesktopRuntime() || protocol?.public !== false))
    .map((protocol) => boundedString(protocol.name, 64).toLowerCase())
    .filter(Boolean);
  return [...new Set(names)];
}

function uniqueAccounts(accounts: PermedAccount[]) {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    const key = accountIdentity(account);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function accountIdentity(account: PermedAccount) {
  return boundedString(account.id || account.alias || account.name || account.username, 256);
}

export function workspaceAssistantConnectionForUniqueAccount(
  protocol: string,
  account: PermedAccount,
  saved: ConnectionInfo | undefined
): ConnectionFormInfo | null {
  const alias = boundedString(account.alias, 64);
  const savedMatchesProtocol = saved?.protocol?.toLowerCase() === protocol;
  const base = {
    protocol,
    manualUsername: "",
    manualPassword: "",
    dynamicPassword: "",
    rememberSecret: false,
    rememberSelection: false,
    preserveStoredSelection: true,
    connectMethod: savedMatchesProtocol ? saved?.connectMethod || "" : "",
    connectOptions: savedMatchesProtocol ? { ...(saved?.connectOptions || {}) } : {},
    availableProtocols: [protocol]
  };
  if (!alias.startsWith("@")) {
    return {
      ...base,
      account: account.name,
      accountId: account.id,
      accountMode: "hosted"
    };
  }
  if (alias === "@ANON") return { ...base, account: "@ANON", accountMode: "anonymous" };
  if (alias === "@INPUT" && savedMatchesProtocol && saved?.personalCredentialId) {
    return {
      ...base,
      account: account.name || alias,
      accountMode: "manual",
      manualUsername: saved.manualUsername || "",
      personalCredentialId: saved.personalCredentialId,
      personalCredentialVersion: saved.personalCredentialVersion,
      personalCredentialSecretType: saved.personalCredentialSecretType || "password"
    };
  }
  if (alias === "@USER" && savedMatchesProtocol && saved?.rememberSecret && saved.dynamicPassword) {
    return {
      ...base,
      account: account.name || alias,
      accountMode: "dynamic",
      dynamicPassword: saved.dynamicPassword,
      rememberSecret: true
    };
  }
  return null;
}

// Keep credential references local; a changed selection requires a new connection plan.
export function workspaceAssistantPersonalCredentialIdentity(connection: ConnectionFormInfo) {
  return stableJson({
    id: connection.personalCredentialId || "",
    version: connection.personalCredentialVersion ?? null
  });
}

function currentOrganizationId(userInfoStore: ReturnType<typeof useUserInfoStore>) {
  return boundedString(userInfoStore.currentUser?.org?.id, 128);
}

function currentWorkspaceContextKey(userInfoStore: ReturnType<typeof useUserInfoStore>) {
  return stableJson({
    site: boundedString(userInfoStore.currentSite, 512),
    account_id: boundedString(userInfoStore.currentAccountId, 256),
    organization_id: currentOrganizationId(userInfoStore)
  });
}

async function loadAuthorizedAsset(assetId: string, runtime: WorkspaceToolRuntime): Promise<AssetItem> {
  const candidates = [
    runtime.automation.snapshot.value?.focusedAsset,
    ...(runtime.automation.snapshot.value?.candidates || [])
  ];
  const candidate = candidates.map(normalizeCandidate).find((item) => item?.id === assetId) || null;
  const organizationId = currentOrganizationId(runtime.userInfoStore);
  const detail = await getAssetDetailRequest(assetId, organizationId);
  const resolvedId = boundedString(detail.id || assetId, 128);
  if (resolvedId !== assetId)
    throw new WorkspaceAssistantError("asset_mismatch", "Authorized asset lookup was inconsistent");
  const protocols = (detail.permed_protocols || detail.permedProtocols || []) as PermedProtocol[];
  const accounts = (detail.permed_accounts || detail.permedAccounts || []) as PermedAccount[];
  return {
    id: resolvedId,
    name: boundedString(detail.name || candidate?.name, 256),
    address: boundedString(detail.address || candidate?.address, 256),
    org_id: boundedString(detail.org_id || organizationId, 128) || undefined,
    platform: choiceValue(detail.platform) || candidate?.platform || "",
    zone: choiceValue(detail.zone) || candidate?.zone || "",
    category: choiceValue(detail.category) || candidate?.category || "",
    type: choiceValue(detail.type) || candidate?.type || "",
    isActive: detail.is_active !== false && candidate?.is_active !== false,
    permedProtocols: protocols,
    permedAccounts: accounts,
    savedConnection: runtime.userInfoStore.getConnectionInfoForAsset(assetId) || undefined
  };
}

function safeCandidates(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((candidate) => {
      const normalized = normalizeCandidate(candidate);
      return normalized ? [normalized] : [];
    })
    .slice(0, limit);
}

function pruneConnectionPlans(runtime: WorkspaceToolRuntime, assetId = "", reserveSlot = false) {
  const now = Date.now();
  for (const [planId, plan] of runtime.plans) {
    if (
      plan.state === "consumed" ||
      plan.expiresAt <= now ||
      (assetId && plan.assetId === assetId && plan.state === "ready")
    ) {
      runtime.plans.delete(planId);
    }
  }
  if (reserveSlot) {
    for (const [planId, plan] of runtime.plans) {
      if (runtime.plans.size < CONNECTION_PLAN_LIMIT) break;
      if (plan.state === "ready") runtime.plans.delete(planId);
    }
  }
  if (reserveSlot && runtime.plans.size >= CONNECTION_PLAN_LIMIT) {
    throw new WorkspaceAssistantError("plan_limit", "Too many workspace connections are already starting");
  }
}

function assertWorkspacePreparationCurrent(
  runtime: WorkspaceToolRuntime,
  expectedOrganizationId: string,
  expectedContextKey: string,
  expectedUiRevision: number,
  signal: AbortSignal
) {
  const reason = workspaceAssistantPreparationInvalidReason({
    aborted: signal.aborted,
    expectedOrganizationId,
    currentOrganizationId: currentOrganizationId(runtime.userInfoStore),
    expectedContextKey,
    currentContextKey: currentWorkspaceContextKey(runtime.userInfoStore),
    expectedUiRevision,
    currentUiRevision: runtime.automation.uiRevision.value
  });
  if (reason === "aborted") throw new DOMException("Workspace connection preparation was cancelled", "AbortError");
  if (reason === "organization_changed") {
    throw new WorkspaceAssistantError("organization_changed", "The active organization changed during preparation");
  }
  if (reason === "context_changed") {
    throw new WorkspaceAssistantError("context_changed", "The active site or account changed during preparation");
  }
  if (reason === "stale_ui") {
    throw new WorkspaceAssistantError("stale_ui", "The workspace changed during connection preparation");
  }
}

async function executeWorkspaceTool(
  session: WorkspaceAssistantSession,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const runtime = runtimes.get(session);
  if (!runtime) throw new WorkspaceAssistantError("session_closed", "Workspace Assistant session is closed");
  const automation = runtime.automation;
  if (signal.aborted) throw new DOMException("Workspace tool call was cancelled", "AbortError");

  if (name === "search_connectable_assets") {
    const query = boundedString(args.query, 256);
    if (!query) throw new WorkspaceAssistantError("invalid_arguments", "A non-empty asset search query is required");
    const limit = Math.max(1, Math.min(20, Math.floor(Number(args.limit) || 10)));
    const ack = await automation.setSearch(query, { signal });
    const matchedCandidates = safeCandidates(ack.candidates, 256);
    const candidateCount = Array.isArray(ack.candidates) ? ack.candidates.length : matchedCandidates.length;
    const candidates = matchedCandidates.slice(0, limit);
    runtime.searchGuard.candidateIds = new Set(matchedCandidates.map((candidate) => candidate.id));
    runtime.searchGuard.candidateCount = candidateCount;
    const searchDecision = workspaceAssistantSearchDecision(runtime.searchGuard.ambiguityPending, candidateCount);
    runtime.searchGuard.ambiguityPending = searchDecision.ambiguityPending;
    if (searchDecision.selectionRequired) automation.requestAssetSelection();
    else automation.clearAssetSelectionRequest();
    return {
      status: searchDecision.status,
      query,
      revision: ack.revision,
      candidate_count: candidateCount,
      candidates,
      candidates_truncated: candidateCount > candidates.length,
      user_selection_required: searchDecision.selectionRequired,
      ...(runtime.searchGuard.ambiguityPending ? { reason: "unresolved_asset_ambiguity" } : {})
    };
  }

  if (name === "reveal_asset") {
    const assetId = boundedString(args.asset_id, 128);
    if (!assetId) throw new WorkspaceAssistantError("invalid_arguments", "asset_id is required");
    const ack = await automation.focusAsset(assetId, {
      query: boundedString(args.query, 256) || undefined,
      signal
    });
    const focusedAsset = normalizeCandidate(ack.focusedAsset);
    return {
      status: "revealed",
      revision: ack.revision,
      asset: focusedAsset || { id: assetId }
    };
  }

  if (name === "prepare_asset_connection") {
    const assetId = boundedString(args.asset_id, 128);
    if (!assetId) throw new WorkspaceAssistantError("invalid_arguments", "asset_id is required");
    if (!runtime.searchGuard.candidateIds.has(assetId)) {
      return {
        status: "search_required",
        reason: "asset_not_in_latest_search",
        user_selection_required: true
      };
    }
    const uiSnapshot = automation.snapshot.value;
    const preparationOrganizationId = currentOrganizationId(runtime.userInfoStore);
    const preparationContextKey = currentWorkspaceContextKey(runtime.userInfoStore);
    const selectionReceipt = uiSnapshot.selectionReceipt;
    const hasValidUserSelection =
      uiSnapshot.focusedAssetSource === "user" &&
      uiSnapshot.focusedAsset?.id === assetId &&
      selectionReceipt?.assetId === assetId &&
      selectionReceipt.revision === uiSnapshot.revision;
    if (workspaceAssistantNeedsAssetSelection(runtime.searchGuard, hasValidUserSelection)) {
      return {
        status: "selection_required",
        reason: runtime.searchGuard.ambiguityPending ? "unresolved_asset_ambiguity" : "multiple_assets",
        user_selection_required: true,
        candidate_count: runtime.searchGuard.candidateCount
      };
    }
    const asset = await loadAuthorizedAsset(assetId, runtime);
    assertWorkspacePreparationCurrent(
      runtime,
      preparationOrganizationId,
      preparationContextKey,
      uiSnapshot.revision,
      signal
    );
    if (!asset.isActive) throw new WorkspaceAssistantError("asset_inactive", "The selected asset is inactive");
    runtime.searchGuard.ambiguityPending = runtime.searchGuard.ambiguityPending && !hasValidUserSelection;
    if (hasValidUserSelection) {
      runtime.searchGuard.candidateIds = new Set([assetId]);
      runtime.searchGuard.candidateCount = 1;
    }
    const reveal = hasValidUserSelection
      ? { revision: uiSnapshot.revision }
      : await automation.focusAsset(assetId, { query: asset.name || asset.address, signal });
    assertWorkspacePreparationCurrent(
      runtime,
      preparationOrganizationId,
      preparationContextKey,
      reveal.revision,
      signal
    );
    const protocols = uniqueProtocols(asset.permedProtocols || []);
    const accounts = uniqueAccounts(asset.permedAccounts || []);
    const connection =
      protocols.length === 1 && accounts.length === 1
        ? workspaceAssistantConnectionForUniqueAccount(protocols[0]!, accounts[0]!, asset.savedConnection)
        : null;

    if (!connection) {
      pruneConnectionPlans(runtime, asset.id);
      runtime.tabs.openSetupSession(asset, { protocol: protocols.length === 1 ? protocols[0] : undefined });
      return {
        status: protocols.length > 1 || accounts.length > 1 ? "selection_required" : "user_action_required",
        setup_opened: true,
        asset: normalizeCandidate(asset),
        revision: reveal.revision,
        protocol_count: protocols.length,
        account_count: accounts.length,
        user_selection_required: true,
        reason:
          protocols.length > 1
            ? "multiple_protocols"
            : accounts.length > 1
              ? "multiple_accounts"
              : "connection_input_required"
      };
    }

    pruneConnectionPlans(runtime, asset.id, true);
    const planId = opaqueId("workspace-plan");
    const expiresAt = Date.now() + CONNECTION_PLAN_TTL_MS;
    const planDigest = await connectionPlanDigest({
      plan_id: planId,
      asset_id: asset.id,
      protocol: connection.protocol,
      ui_revision: reveal.revision,
      expires_at: expiresAt,
      organization_id: currentOrganizationId(runtime.userInfoStore)
    });
    assertWorkspacePreparationCurrent(
      runtime,
      preparationOrganizationId,
      preparationContextKey,
      reveal.revision,
      signal
    );
    runtime.plans.set(planId, {
      id: planId,
      digest: planDigest,
      expiresAt,
      organizationId: currentOrganizationId(runtime.userInfoStore),
      contextKey: currentWorkspaceContextKey(runtime.userInfoStore),
      uiRevision: reveal.revision,
      assetId: asset.id,
      assetName: asset.name,
      protocol: connection.protocol,
      accountIdentity: accountIdentity(accounts[0]!),
      personalCredentialIdentity: workspaceAssistantPersonalCredentialIdentity(connection),
      state: "ready"
    });
    return {
      status: "ready_to_connect",
      asset: normalizeCandidate(asset),
      protocol: connection.protocol,
      account_count: 1,
      plan_id: planId,
      plan_digest: planDigest,
      expires_in_seconds: Math.floor(CONNECTION_PLAN_TTL_MS / 1000),
      approval_required: true
    };
  }

  if (name === "connect_asset") {
    const planId = boundedString(args.plan_id, 160);
    const planDigest = boundedString(args.plan_digest, 160);
    const assetId = boundedString(args.asset_id, 128);
    const assetName = boundedString(args.asset_name, 256);
    const protocol = boundedString(args.protocol, 64).toLowerCase();
    const plan = runtime.plans.get(planId);
    if (
      !plan ||
      plan.digest !== planDigest ||
      plan.assetId !== assetId ||
      plan.protocol !== protocol ||
      (assetName && plan.assetName !== assetName)
    ) {
      throw new WorkspaceAssistantError("invalid_plan", "The local connection plan is invalid");
    }
    if (workspaceAssistantPlanExpired(plan.expiresAt)) {
      runtime.plans.delete(planId);
      throw new WorkspaceAssistantError("expired_plan", "The local connection plan expired");
    }
    if (plan.organizationId !== currentOrganizationId(runtime.userInfoStore)) {
      throw new WorkspaceAssistantError("organization_changed", "The active organization changed");
    }
    if (plan.contextKey !== currentWorkspaceContextKey(runtime.userInfoStore)) {
      throw new WorkspaceAssistantError("context_changed", "The active site or account changed");
    }
    if (automation.uiRevision.value !== plan.uiRevision) {
      throw new WorkspaceAssistantError("stale_ui", "The workspace changed after the connection was prepared");
    }
    if (signal.aborted) throw new DOMException("Workspace connection was cancelled", "AbortError");
    if (!workspaceAssistantClaimConnectionPlan(plan)) {
      throw new WorkspaceAssistantError("plan_consumed", "The local connection plan was already consumed");
    }
    try {
      const revalidatedAsset = await loadAuthorizedAsset(plan.assetId, runtime);
      const currentProtocols = uniqueProtocols(revalidatedAsset.permedProtocols || []);
      const currentAccounts = uniqueAccounts(revalidatedAsset.permedAccounts || []);
      const currentConnection =
        currentProtocols.length === 1 && currentAccounts.length === 1
          ? workspaceAssistantConnectionForUniqueAccount(
              currentProtocols[0]!,
              currentAccounts[0]!,
              revalidatedAsset.savedConnection
            )
          : null;
      if (
        !revalidatedAsset.isActive ||
        currentProtocols.length !== 1 ||
        currentProtocols[0] !== plan.protocol ||
        currentAccounts.length !== 1 ||
        accountIdentity(currentAccounts[0]!) !== plan.accountIdentity ||
        !currentConnection ||
        workspaceAssistantPersonalCredentialIdentity(currentConnection) !== plan.personalCredentialIdentity
      ) {
        throw new WorkspaceAssistantError(
          "connection_changed",
          "The authorized protocol, account or personal credential changed after the connection was prepared"
        );
      }
      if (workspaceAssistantPlanExpired(plan.expiresAt)) {
        throw new WorkspaceAssistantError("expired_plan", "The local connection plan expired during revalidation");
      }
      if (plan.organizationId !== currentOrganizationId(runtime.userInfoStore)) {
        throw new WorkspaceAssistantError(
          "organization_changed",
          "The active organization changed during revalidation"
        );
      }
      if (plan.contextKey !== currentWorkspaceContextKey(runtime.userInfoStore)) {
        throw new WorkspaceAssistantError("context_changed", "The active site or account changed during revalidation");
      }
      if (automation.uiRevision.value !== plan.uiRevision) {
        throw new WorkspaceAssistantError("stale_ui", "The workspace changed after the connection was prepared");
      }
      if (signal.aborted) throw new DOMException("Workspace connection was cancelled", "AbortError");
      const sessionStarted = await runtime.launcher.launchWithInfo(
        {
          ...revalidatedAsset,
          permedProtocols: (revalidatedAsset.permedProtocols || []).filter(
            (item) => item.name.toLowerCase() === plan.protocol
          ),
          permedAccounts: [currentAccounts[0]!]
        },
        currentConnection
      );
      if (!sessionStarted) throw new WorkspaceAssistantError("connection_failed", "The asset session did not start");
      return {
        status: "session_started",
        asset: normalizeCandidate(revalidatedAsset),
        protocol: plan.protocol
      };
    } finally {
      plan.state = "consumed";
      runtime.plans.delete(planId);
    }
  }

  throw new WorkspaceAssistantError("unknown_tool", `Unknown Workspace Assistant tool: ${name}`);
}

function toolBinding(frame: KokoMcpRequestFrame) {
  const meta = isRecord(frame.data.params._meta) ? frame.data.params._meta : {};
  return isRecord(meta[AGENT_MCP_BINDING_META_KEY]) ? meta[AGENT_MCP_BINDING_META_KEY] : {};
}

function queueLocalResponse(
  session: WorkspaceAssistantSession,
  frame: KokoMcpResponseFrame | KokoMcpCancelResultFrame
) {
  queueMicrotask(() => {
    void session.agent.actions.receiveKokoFrame(frame).catch((cause) => {
      session.errorCode = "tool_result_failed";
      session.errorText = cause instanceof Error ? cause.message : "Failed to deliver Workspace Assistant tool result";
    });
  });
}

function toolResponse(result: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result
  };
}

function rememberInvocation(runtime: WorkspaceToolRuntime, invocationId: string) {
  runtime.invocationOrder.push(invocationId);
  while (runtime.invocationOrder.length > COMPLETED_INVOCATION_LIMIT) {
    const evicted = runtime.invocationOrder.shift();
    if (evicted) runtime.invocations.delete(evicted);
  }
}

function workspaceMessageContext(runtime: WorkspaceAssistantRuntime) {
  const snapshot = runtime.automation.snapshot.value;
  const selectedAssetId =
    snapshot.selectionReceipt?.assetId ||
    (snapshot.candidates.length === 1 ? snapshot.candidates[0]?.id : "") ||
    snapshot.focusedAsset?.id ||
    "";
  return {
    ui_revision: snapshot.revision,
    ...(selectedAssetId ? { selected_asset_id: selectedAssetId } : {}),
    ...(snapshot.focusedAsset?.id ? { focused_asset_id: snapshot.focusedAsset.id } : {}),
    ...(snapshot.focusedAssetSource ? { focused_asset_source: snapshot.focusedAssetSource } : {})
  };
}

async function handleLocalToolFrame(
  session: WorkspaceAssistantSession,
  frame: KokoMcpRequestFrame | KokoMcpCancelFrame
) {
  const runtime = runtimes.get(session);
  if (!runtime) return;
  if (frame.type === "mcp.cancel") {
    const requestId = String(frame.data.params.requestId);
    runtime.activeCalls.get(requestId)?.abort();
    runtime.activeCalls.delete(requestId);
    queueLocalResponse(session, {
      type: "mcp.cancel_result",
      version: AGENT_PROTOCOL_VERSION,
      resource_session_id: frame.resource_session_id,
      data: { jsonrpc: "2.0", id: requestId, result: { cancelled: true } }
    });
    return;
  }

  const requestId = String(frame.data.id);
  const name = boundedString(frame.data.params.name, 128);
  const args = isRecord(frame.data.params.arguments) ? frame.data.params.arguments : {};
  const binding = toolBinding(frame);
  const registrationId = boundedString(binding.registration_id, 128);
  const expectedRegistrationId = session.agent.state.registrationIds[name] || "";
  const invocationId = boundedString(binding.invocation_id, 160);
  const revision = Number(binding.revision);
  let result: Record<string, unknown> | undefined;
  let error: { code: number; message: string } | undefined;

  try {
    if (!registrationId || !expectedRegistrationId || registrationId !== expectedRegistrationId) {
      throw new WorkspaceAssistantError("invalid_registration", "Workspace tool registration binding is invalid");
    }
    if (!invocationId) {
      throw new WorkspaceAssistantError("invalid_invocation", "Workspace tool invocation binding is missing");
    }
    if (revision !== WORKSPACE_TOOL_REVISION) {
      throw new WorkspaceAssistantError("stale_revision", "Workspace tool definition revision is stale");
    }
    const fingerprint = stableJson({ tool: name, arguments: args });
    let invocation = runtime.invocations.get(invocationId);
    if (invocation && invocation.fingerprint !== fingerprint) {
      throw new WorkspaceAssistantError(
        "invocation_conflict",
        "Workspace tool invocation id was reused with different arguments"
      );
    }
    if (!invocation) {
      const controller = new AbortController();
      runtime.activeCalls.set(requestId, controller);
      invocation = {
        fingerprint,
        promise: executeWorkspaceTool(session, name, args, controller.signal)
      };
      runtime.invocations.set(invocationId, invocation);
      rememberInvocation(runtime, invocationId);
    }
    result = await invocation.promise;
  } catch (cause) {
    const cancelled = cause instanceof DOMException && cause.name === "AbortError";
    error = {
      code: cancelled ? -32800 : -32602,
      message:
        cause instanceof WorkspaceAssistantError
          ? cause.message
          : cancelled
            ? "Workspace tool call was cancelled"
            : "Workspace tool execution failed"
    };
  } finally {
    runtime.activeCalls.delete(requestId);
  }

  queueLocalResponse(session, {
    type: "mcp.response",
    version: AGENT_PROTOCOL_VERSION,
    resource_session_id: frame.resource_session_id,
    data: {
      jsonrpc: "2.0",
      id: requestId,
      ...(error ? { error } : { result: toolResponse(result!) })
    }
  });
}

function partData(message: WorkspaceAssistantChatMessage, type: string) {
  const part = message.parts.find((candidate) => candidate.type === type);
  return part && "data" in part ? (part.data as WorkspaceAssistantEventData) : undefined;
}

function isWorkspaceAssistantChatMessage(value: unknown): value is WorkspaceAssistantChatMessage {
  if (!isRecord(value) || typeof value.id !== "string") return false;
  if ((value.role !== "user" && value.role !== "assistant") || !Array.isArray(value.parts)) return false;
  return value.parts.every((part) => {
    if (!isRecord(part) || typeof part.type !== "string") return false;
    return part.type === "text" ? typeof part.text === "string" : part.type.startsWith("data-") && "data" in part;
  });
}

export function workspaceAssistantTimelineMessage(message: WorkspaceAssistantChatMessage) {
  return agentChatStreamMessage(
    message,
    (part) => !["data-capability", "data-input-lock", "data-progress"].includes(part.type)
  );
}

export function workspaceAssistantReadOnlyApprovalId(value: unknown) {
  if (!isRecord(value) || value.resolved === true) return "";
  const tool = String(value.tool || "");
  if (!["search_connectable_assets", "reveal_asset", "prepare_asset_connection"].includes(tool)) return "";
  return String(value.approvalId || value.id || "");
}

function handleWorkspaceAssistantMessage(scopeId: string, value: unknown) {
  const session = sessions.get(scopeId);
  if (!session || !isWorkspaceAssistantChatMessage(value)) return;
  const transport = transports.get(session);
  const capability = partData(value, "data-capability");
  if (capability) {
    session.enabled = Boolean(capability.enabled);
    if (!session.enabled) {
      session.taskActive = false;
      session.inputLocked = false;
    }
  }
  const inputLock = partData(value, "data-input-lock");
  if (inputLock) session.inputLocked = Boolean(inputLock.locked);
  const readOnlyApprovalId = workspaceAssistantReadOnlyApprovalId(partData(value, "data-approval"));
  if (readOnlyApprovalId) {
    void session.agent.actions.resolveApproval(readOnlyApprovalId, "approve").catch((cause) => {
      session.errorCode = "approval_failed";
      session.errorText = cause instanceof Error ? cause.message : "Failed to approve Workspace Assistant tool";
    });
  }
  const progress = partData(value, "data-progress");
  const runtimeState = String(progress?.state || "");
  const { eventType, runFinished } = agentChatEventLifecycle(value);
  if (progress) {
    session.runtimeState = runtimeState;
    if (runtimeState && !runFinished) session.taskActive = true;
  }
  if (runFinished) {
    session.taskActive = false;
    session.inputLocked = false;
    if (eventType !== "run.completed") runtimes.get(session)?.automation.clearAssetSelectionRequest();
  }
  const runtimeError = partData(value, "data-error");
  if (runtimeError) {
    session.taskActive = false;
    session.inputLocked = false;
    session.errorCode = String(runtimeError.code || "failed");
    session.errorText = String(runtimeError.message || "Workspace Assistant failed");
  }

  const timelineMessage = workspaceAssistantTimelineMessage(value);
  if (timelineMessage && !transport?.receive(timelineMessage)) {
    session.chat.messages.value = [...session.chat.messages.value, timelineMessage];
  }
  if (!session.enabled || runtimeError || runFinished) {
    transport?.finish();
  }
}

function createWorkspaceAssistantSession(scopeId: string, dependencies: WorkspaceAssistantRuntime) {
  const organizationId = currentOrganizationId(dependencies.userInfoStore);
  const contextKey = currentWorkspaceContextKey(dependencies.userInfoStore);
  const resourceSessionId = opaqueId("workspace");
  let session: WorkspaceAssistantSession;
  const transport = markRaw(new WorkspaceAssistantTransport(() => session));
  const relay = markRaw(
    new AgentToolRelay({
      resourceSessionId: () => resourceSessionId,
      revision: () => WORKSPACE_TOOL_REVISION,
      sendFrame: (frame) => {
        void handleLocalToolFrame(session, frame);
      }
    })
  );
  const agent = markRaw(
    useAgentSession({
      domain: "workspace",
      allowedApprovalModes: ["auto"],
      relay,
      messageMetadata: () => ({
        domain: "workspace",
        targetId: scopeId,
        context: workspaceMessageContext(dependencies)
      }),
      onMessage: (message) => handleWorkspaceAssistantMessage(scopeId, message),
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
        session.runtimeState = "";
        session.errorCode = "";
        session.errorText = "";
      },
      onUnavailable: (cause) => {
        if (!session) return;
        dependencies.automation.clearAssetSelectionRequest();
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
      useChat<WorkspaceAssistantChatMessage>({
        id: `workspace:${scopeId}`,
        transport,
        generateId: () => opaqueId("workspace-message"),
        onError: (cause) => {
          session.taskActive = false;
          session.inputLocked = false;
          session.errorCode = cause instanceof WorkspaceAssistantError ? cause.code : "failed";
          session.errorText = cause.message;
        }
      })
    )!
  );

  session = reactive({
    kind: "workspace",
    scopeId,
    organizationId,
    contextKey,
    agent,
    chat,
    enabled: false,
    approvalMode: "auto",
    inputLocked: false,
    taskActive: false,
    draft: "",
    runtimeState: "",
    errorCode: "",
    errorText: ""
  }) as WorkspaceAssistantSession;
  runtimes.set(session, {
    ...dependencies,
    plans: new Map(),
    invocations: new Map(),
    invocationOrder: [],
    activeCalls: new Map(),
    searchGuard: { candidateIds: new Set(), candidateCount: 0, ambiguityPending: false }
  });
  transports.set(session, transport);
  chatScopes.set(session, chatScope);
  const uiRevision = Number(
    dependencies.automation.snapshot.value?.revision || dependencies.automation.uiRevision.value || 0
  );
  void agent.actions
    .attachManifest(workspaceAssistantManifest(resourceSessionId, { scopeId, organizationId, uiRevision }))
    .catch((cause) => {
      session.errorCode = "agent_unavailable";
      session.errorText = cause instanceof Error ? cause.message : "Failed to create Workspace Assistant session";
    });
  return session;
}

export function ensureWorkspaceAssistantSession(scopeId: string, dependencies: WorkspaceAssistantRuntime) {
  const normalizedScopeId = boundedString(scopeId, 128) || DEFAULT_WORKSPACE_ASSISTANT_SCOPE;
  const existing = sessions.get(normalizedScopeId);
  if (existing && existing.contextKey === currentWorkspaceContextKey(dependencies.userInfoStore)) return existing;
  if (existing) disposeWorkspaceAssistantSession(normalizedScopeId);
  const session = createWorkspaceAssistantSession(normalizedScopeId, dependencies);
  sessions.set(normalizedScopeId, session);
  return session;
}

export function isWorkspaceAssistantBusy(scopeId = DEFAULT_WORKSPACE_ASSISTANT_SCOPE) {
  const session = sessions.get(scopeId);
  if (!session) return false;
  const status = session.chat.status.value;
  return session.inputLocked || session.taskActive || status === "submitted" || status === "streaming";
}

export async function submitWorkspaceAssistantPrompt(prompt: string, scopeId = DEFAULT_WORKSPACE_ASSISTANT_SCOPE) {
  const session = sessions.get(scopeId);
  if (!session?.enabled || !session.agent.state.available) {
    throw new WorkspaceAssistantError("unavailable", "Workspace Assistant is unavailable");
  }
  const text = prompt.trim();
  if (!text) throw new WorkspaceAssistantError("invalid_message", "Workspace Assistant requires a user message");
  if (isWorkspaceAssistantBusy(scopeId)) {
    throw new WorkspaceAssistantError("response_active", "A Workspace Assistant response is active");
  }
  const transport = transports.get(session);
  if (!transport) throw new WorkspaceAssistantError("unavailable", "Workspace Assistant is unavailable");

  session.errorCode = "";
  session.errorText = "";
  session.chat.clearError();
  session.taskActive = true;
  try {
    const runtime = runtimes.get(session);
    if (!runtime) throw new WorkspaceAssistantError("session_closed", "Workspace Assistant session is closed");
    await session.agent.actions.updateContext({
      session_kind: "workspace",
      interaction_mode: "assist_navigation_and_connection",
      scope_id: session.scopeId,
      organization_id: session.organizationId,
      ...workspaceMessageContext(runtime)
    });
    const dispatched = transport.waitForNextDispatch();
    const response = session.chat.sendMessage({ text, metadata: { domain: "workspace", targetId: scopeId } });
    void response.catch(() => {
      session.taskActive = false;
      if (!session.errorCode && !session.errorText) session.errorCode = "send_failed";
    });
    await dispatched;
  } catch (cause) {
    session.taskActive = false;
    const error = cause instanceof Error ? cause : new WorkspaceAssistantError("send_failed", "Request failed");
    transport.cancelPendingDispatch(error);
    session.errorCode = error instanceof WorkspaceAssistantError ? error.code : "send_failed";
    session.errorText = error.message;
    throw error;
  }
}

export function interruptWorkspaceAssistant(scopeId = DEFAULT_WORKSPACE_ASSISTANT_SCOPE) {
  const session = sessions.get(scopeId);
  if (!session) return;
  runtimes.get(session)?.automation.clearAssetSelectionRequest();
  void session.agent.actions.cancel().catch((cause) => {
    session.errorCode = "interrupt_failed";
    session.errorText = cause instanceof Error ? cause.message : "Failed to interrupt Workspace Assistant";
  });
  for (const controller of runtimes.get(session)?.activeCalls.values() || []) controller.abort();
  session.chat.stop();
  session.taskActive = false;
  session.inputLocked = false;
}

export async function resolveWorkspaceAssistantApproval(
  approvalId: string,
  decision: AgentApprovalDecision,
  scopeId = DEFAULT_WORKSPACE_ASSISTANT_SCOPE
) {
  const session = sessions.get(scopeId);
  if (!session) throw new WorkspaceAssistantError("unavailable", "Workspace Assistant is unavailable");
  await session.agent.actions.resolveApproval(approvalId, decision);
}

export function disposeWorkspaceAssistantSession(scopeId = DEFAULT_WORKSPACE_ASSISTANT_SCOPE) {
  const session = sessions.get(scopeId);
  if (!session) return;
  runtimes.get(session)?.automation.clearAssetSelectionRequest();
  for (const controller of runtimes.get(session)?.activeCalls.values() || []) controller.abort();
  transports.get(session)?.disconnect();
  void session.agent.actions.dispose();
  chatScopes.get(session)?.stop();
  runtimes.delete(session);
  transports.delete(session);
  chatScopes.delete(session);
  sessions.delete(scopeId);
}
