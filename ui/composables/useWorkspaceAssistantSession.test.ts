import { describe, expect, it, vi } from "vitest";
import { computed, shallowRef, triggerRef, watch } from "vue";
import { MCP_FINAL_RESULT_META_KEY, parseKokoMcpFrame } from "#koko/composables/agent/types";
import type { WorkspaceAssistantChatMessage, WorkspaceAssistantSession } from "./useWorkspaceAssistantSession";
import {
  workspaceAssistantClaimConnectionPlan,
  workspaceAssistantConnectionChoices,
  workspaceAssistantConnectionForUniqueAccount,
  workspaceAssistantPersonalCredentialIdentity,
  workspaceAssistantManifest,
  workspaceAssistantMessages,
  workspaceAssistantNeedsAssetSelection,
  workspaceAssistantPlanExpired,
  workspaceAssistantPreparationInvalidReason,
  workspaceAssistantReadOnlyApprovalId,
  workspaceAssistantScopeId,
  workspaceAssistantSearchDecision,
  workspaceAssistantSearchCandidates,
  workspaceAssistantTerminalTraceTaskId,
  workspaceAssistantTimelineMessage
} from "./useWorkspaceAssistantSession";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ currentUser: null, getConnectionInfoForAsset: () => null })
}));

vi.mock("~/composables/useApiRequest", () => ({ getAssetDetailRequest: vi.fn() }));

describe("Workspace Assistant capability", () => {
  const manualAccount = {
    id: "manual",
    name: "Manual",
    alias: "@INPUT",
    username: "",
    date_expired: "",
    has_secret: false,
    has_username: false,
    secret_type: "password",
    actions: []
  };
  const savedCredential = {
    protocol: "ssh",
    username: "Manual",
    personalCredentialId: "credential-1",
    personalCredentialVersion: 2,
    personalCredentialSecretType: "ssh_key",
    rememberSecret: false
  };

  it("connects with a saved personal credential without a locally stored secret", () => {
    const connection = workspaceAssistantConnectionForUniqueAccount("ssh", manualAccount, savedCredential);
    expect(connection).toMatchObject({
      accountMode: "manual",
      personalCredentialId: "credential-1",
      personalCredentialVersion: 2,
      personalCredentialSecretType: "ssh_key",
      manualPassword: "",
      rememberSecret: false,
      preserveStoredSelection: true
    });
    expect(connection?.savePersonalCredential).toBeUndefined();
  });

  it("requires connection input when no matching personal credential is saved", () => {
    expect(workspaceAssistantConnectionForUniqueAccount("ssh", manualAccount, undefined)).toBeNull();
    expect(workspaceAssistantConnectionForUniqueAccount("rdp", manualAccount, savedCredential)).toBeNull();
    expect(
      workspaceAssistantConnectionForUniqueAccount("ssh", manualAccount, {
        ...savedCredential,
        personalCredentialId: undefined
      })
    ).toBeNull();
  });

  it("binds the local connection plan to the selected credential and its version", () => {
    const connection = workspaceAssistantConnectionForUniqueAccount("ssh", manualAccount, savedCredential)!;
    const identity = workspaceAssistantPersonalCredentialIdentity(connection);
    expect(workspaceAssistantPersonalCredentialIdentity({ ...connection })).toBe(identity);
    expect(
      workspaceAssistantPersonalCredentialIdentity({ ...connection, personalCredentialId: "credential-2" })
    ).not.toBe(identity);
    expect(workspaceAssistantPersonalCredentialIdentity({ ...connection, personalCredentialVersion: 3 })).not.toBe(
      identity
    );
    expect(workspaceAssistantPersonalCredentialIdentity({ ...connection, personalCredentialId: undefined })).not.toBe(
      identity
    );
  });

  it("does not attach personal credentials to hosted or anonymous accounts", () => {
    for (const alias of ["root", "@ANON"]) {
      const connection = workspaceAssistantConnectionForUniqueAccount(
        "ssh",
        { ...manualAccount, alias },
        savedCredential
      );
      expect(connection).not.toBeNull();
      expect(connection?.personalCredentialId).toBeUndefined();
    }
  });

  it("resolves only authorized explicit protocol and account choices", () => {
    const asset = {
      permedProtocols: [{ name: "ssh" }, { name: "sftp" }],
      permedAccounts: [
        { ...manualAccount, id: "one" },
        { ...manualAccount, id: "two" }
      ]
    } as any;
    expect(workspaceAssistantConnectionChoices(asset)).toMatchObject({ protocol: undefined, account: undefined });
    expect(workspaceAssistantConnectionChoices(asset, "sftp", "two")).toMatchObject({
      protocol: "sftp",
      account: { id: "two" }
    });
    expect(() => workspaceAssistantConnectionChoices(asset, "rdp", "two")).toThrow("not authorized");
    expect(() => workspaceAssistantConnectionChoices(asset, "ssh", "missing")).toThrow("not authorized");
  });

  it("notifies the timeline for every shallow AI SDK message update", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "" }]
    } as WorkspaceAssistantChatMessage;
    const source = shallowRef<WorkspaceAssistantChatMessage[]>([message]);
    const session = { chat: { messages: source } } as unknown as Pick<WorkspaceAssistantSession, "chat">;
    const visibleMessages = computed(() => workspaceAssistantMessages(session));
    const observed: string[] = [];
    const stop = watch(
      visibleMessages,
      (messages) => {
        const part = messages[0]?.parts[0];
        observed.push(part?.type === "text" ? part.text : "");
      },
      { flush: "sync" }
    );

    source.value[0] = { ...message, parts: [{ type: "text", text: "第一段" }] };
    triggerRef(source);
    source.value[0] = { ...message, parts: [{ type: "text", text: "第一段第二段" }] };
    triggerRef(source);

    expect(visibleMessages.value).not.toBe(source.value);
    expect(observed).toEqual(["第一段", "第一段第二段"]);
    stop();
  });

  it("counts asset IDs rather than repeated tree entries or matching labels", () => {
    const candidates = workspaceAssistantSearchCandidates([
      { id: "one", name: "server", address: "10.0.0.1", password: "private" },
      { id: "one", name: "server", address: "10.0.0.1" },
      { id: "two", name: "server", address: "10.0.0.2" },
      { name: "invalid" }
    ]);
    expect(candidates.map((candidate) => candidate.id)).toEqual(["one", "two"]);
    expect(workspaceAssistantSearchDecision(false, candidates.length).selectionRequired).toBe(true);
    expect(JSON.stringify(candidates)).not.toMatch(/password|private/);
  });

  it("registers only the bounded semantic workspace tools", () => {
    const manifest = workspaceAssistantManifest("workspace-resource", {
      scopeId: "global",
      organizationId: "org-1",
      uiRevision: 7
    });

    expect(manifest.profile).toBe("workspace");
    expect(manifest.tools.map((tool) => tool.name).sort()).toEqual([
      "arrange_workspace",
      "close_sessions",
      "connect_asset",
      "get_asset_connection_options",
      "get_terminal_task",
      "get_workspace_state",
      "list_assets",
      "list_terminal_targets",
      "navigate_workspace",
      "open_session",
      "prepare_asset_connection",
      "reconnect_session",
      "search_connectable_assets",
      "set_asset_favorite",
      "start_terminal_task"
    ]);
    const wire = manifest.tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      parameters: inputSchema
    }));
    expect(new TextEncoder().encode(JSON.stringify(wire)).length).toBeLessThan(10000);
    expect(manifest.tools.find((tool) => tool.name === "prepare_asset_connection")?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: false
    });
    const connect = manifest.tools.at(-1)!;
    expect(connect.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ["plan_id", "plan_digest", "asset_id", "protocol", "account_id", "connect_method"]
    });
    expect(connect.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
    expect(connect._meta?.[MCP_FINAL_RESULT_META_KEY]).toBeUndefined();
    expect(manifest.tools.some((tool) => /snippet|batch|execute/.test(tool.name))).toBe(false);
    expect(
      parseKokoMcpFrame({
        type: "mcp.manifest",
        version: 1,
        resource_session_id: manifest.resourceSessionId,
        data: {
          profile: manifest.profile,
          revision: manifest.revision,
          context: manifest.context,
          tools: manifest.tools
        }
      })
    ).toMatchObject({ data: { profile: "workspace" } });
  });

  it("keeps the Kael panel scope identifier within the server limit", () => {
    const scopeId = workspaceAssistantScopeId();
    expect(scopeId).toMatch(/^workspace-scope-/);
    expect(new TextEncoder().encode(scopeId).byteLength).toBeLessThanOrEqual(128);
  });

  it("auto-approves navigation tools but never the connection tool", () => {
    expect(workspaceAssistantReadOnlyApprovalId({ approvalId: "approval-1", tool: "search_connectable_assets" })).toBe(
      "approval-1"
    );
    expect(workspaceAssistantReadOnlyApprovalId({ approvalId: "approval-2", tool: "connect_asset" })).toBe("");
  });

  it("keeps asset ambiguity pending until Luna records a real user selection", () => {
    const ambiguous = workspaceAssistantSearchDecision(false, 3);
    const narrowedByAssistant = workspaceAssistantSearchDecision(ambiguous.ambiguityPending, 1);

    expect(narrowedByAssistant).toMatchObject({
      ambiguityPending: true,
      selectionRequired: true,
      status: "selection_required"
    });
    expect(
      workspaceAssistantNeedsAssetSelection(
        { ambiguityPending: narrowedByAssistant.ambiguityPending, candidateCount: 1 },
        false
      )
    ).toBe(true);
    expect(
      workspaceAssistantNeedsAssetSelection(
        { ambiguityPending: narrowedByAssistant.ambiguityPending, candidateCount: 1 },
        true
      )
    ).toBe(false);

    expect(workspaceAssistantSearchDecision(false, 1)).toMatchObject({
      ambiguityPending: false,
      selectionRequired: false,
      status: "match_found"
    });
  });

  it("hides transport-only state from the visible timeline", () => {
    const message = {
      id: "workspace-events",
      role: "assistant",
      metadata: { domain: "workspace" },
      parts: [
        { type: "data-capability", data: { enabled: true } },
        { type: "data-input-lock", data: { locked: true } },
        { type: "data-progress", data: { state: "completed" } },
        { type: "text", text: "请选择一个资产" }
      ]
    } as Parameters<typeof workspaceAssistantTimelineMessage>[0];

    expect(workspaceAssistantTimelineMessage(message)?.parts).toEqual([{ type: "text", text: "请选择一个资产" }]);
  });

  it("lets the child task own pending progress while preserving errors, approvals and the final answer", () => {
    const message = {
      id: "parent-poll",
      role: "assistant",
      metadata: { domain: "workspace", agentEventType: "message.delta" },
      parts: [{ type: "text", text: "The command was sent; waiting for approval." }]
    } as WorkspaceAssistantChatMessage;
    expect(workspaceAssistantTimelineMessage(message, true)).toBeNull();
    for (const type of ["data-error", "data-approval", "data-agent-tool", "data-terminal-task"]) {
      const event = {
        ...message,
        parts: [...message.parts, { type, data: { id: "event-1" } }]
      } as WorkspaceAssistantChatMessage;
      expect(workspaceAssistantTimelineMessage(event, true)?.parts).toEqual([{ type, data: { id: "event-1" } }]);
    }
    expect(workspaceAssistantTimelineMessage({ ...message, role: "user" }, true)?.parts).toEqual(message.parts);
    const completed = {
      ...message,
      parts: [{ type: "text", text: "Disk usage is 46%." }]
    } as WorkspaceAssistantChatMessage;
    expect(workspaceAssistantTimelineMessage(completed, false)?.parts).toEqual(completed.parts);
    expect(message.parts).toEqual([{ type: "text", text: "The command was sent; waiting for approval." }]);
  });

  it("puts successful dispatch and polling receipts inside their task, never hides failed or unrelated tools", () => {
    const tasks = [
      { id: "task-1", prompt: "Inspect", target: { target_id: "target-1" }, active: true, status: "waiting_approval" }
    ] as WorkspaceAssistantSession["terminalTasks"];
    expect(
      workspaceAssistantTerminalTraceTaskId(
        { toolName: "start_terminal_task", status: "running", arguments: { target_id: "target-1", prompt: "Inspect" } },
        tasks
      )
    ).toBe("task-1");
    expect(
      workspaceAssistantTerminalTraceTaskId(
        {
          toolName: "start_terminal_task",
          status: "success",
          result: { task_id: "task-1", status: "waiting_approval", done: false }
        },
        tasks
      )
    ).toBe("task-1");
    const poll = { toolName: "get_terminal_task", status: "success", arguments: { task_id: "task-1" } };
    expect(workspaceAssistantTerminalTraceTaskId(poll, tasks)).toBe("task-1");
    for (const status of ["error", "failed", "cancelled", "unknown", "timeout"]) {
      expect(workspaceAssistantTerminalTraceTaskId({ ...poll, status }, tasks)).toBe("");
    }
    expect(workspaceAssistantTerminalTraceTaskId({ ...poll, arguments: { task_id: "another-task" } }, tasks)).toBe("");
    expect(workspaceAssistantTerminalTraceTaskId({ ...poll, toolName: "connect_asset" }, tasks)).toBe("");
    expect(tasks[0]?.status).toBe("waiting_approval");
  });

  it("treats a connection plan as expired at its exact deadline", () => {
    expect(workspaceAssistantPlanExpired(1_000, 999)).toBe(false);
    expect(workspaceAssistantPlanExpired(1_000, 1_000)).toBe(true);
  });

  it("claims a single-use connection plan before any asynchronous revalidation", () => {
    const plan = { state: "ready" };
    expect(workspaceAssistantClaimConnectionPlan(plan)).toBe(true);
    expect(plan.state).toBe("connecting");
    expect(workspaceAssistantClaimConnectionPlan(plan)).toBe(false);
  });

  it("rejects stale preparation work after an abort or context change", () => {
    const current = {
      aborted: false,
      expectedOrganizationId: "org-1",
      currentOrganizationId: "org-1",
      expectedContextKey: "site-a/account-a/org-1",
      currentContextKey: "site-a/account-a/org-1",
      expectedUiRevision: 4,
      currentUiRevision: 4
    };
    expect(workspaceAssistantPreparationInvalidReason(current)).toBe("");
    expect(workspaceAssistantPreparationInvalidReason({ ...current, aborted: true })).toBe("aborted");
    expect(workspaceAssistantPreparationInvalidReason({ ...current, currentOrganizationId: "org-2" })).toBe(
      "organization_changed"
    );
    expect(
      workspaceAssistantPreparationInvalidReason({ ...current, currentContextKey: "site-b/account-a/org-1" })
    ).toBe("context_changed");
    expect(workspaceAssistantPreparationInvalidReason({ ...current, currentUiRevision: 5 })).toBe("stale_ui");
  });
});
