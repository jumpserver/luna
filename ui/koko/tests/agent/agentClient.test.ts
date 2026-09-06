import type { AgentHttpRequest } from "#koko/composables/agent/agentClient";
import { expect, it, vi } from "vitest";
import { reactive } from "vue";
import { AgentClient, AgentHttpError } from "#koko/composables/agent/agentClient";

const runtime = vi.hoisted(() => ({ desktop: false }));
const desktop = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: desktop.invoke }));

vi.mock("~/utils/runtime", () => ({
  getDesktopRuntime: () => "web",
  getWebApiHeaders: () => ({ "X-JMS-ORG": "org-1" }),
  getWebApiMutationHeaders: () => ({ "X-JMS-ORG": "org-1", "X-CSRFToken": "csrf" }),
  isDesktopRuntime: () => runtime.desktop,
  isElectronRuntime: () => false,
  withWebSitePrefix: (path: string) => path
}));

const manifest = {
  profile: "terminal" as const,
  context: { language: "shell" },
  resourceSessionId: "resource-1",
  revision: 3,
  tools: [
    {
      name: "terminal_context",
      description: "Read terminal context",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, idempotentHint: true }
    }
  ]
};

function kaelRequest(requests: AgentHttpRequest[]) {
  return async <T>(request: AgentHttpRequest): Promise<T> => {
    requests.push(request);
    if (request.path.endsWith("/bootstrap")) {
      return {
        agent_engine: "codex",
        agent_protocol_version: 1,
        instance_id: "kael-1",
        protocol_version: 1,
        capability_version: 1
      } as T;
    }
    if (request.path.endsWith("/conversations")) return { id: "conversation-1" } as T;
    if (request.path.endsWith("/panel-sessions")) return { id: "panel-1", cursor: 1 } as T;
    if (request.path.endsWith("/context")) return { version: 1 } as T;
    if (request.path.endsWith("/registrations")) {
      return {
        registry_revision: 1,
        registrations: [{ id: "registration-1", client_key: "terminal_context", name: "terminal_context" }]
      } as T;
    }
    if (request.path.endsWith("/messages")) return { id: "message-1" } as T;
    if (request.path.endsWith("/runs")) return { id: "run-1", state: "queued" } as T;
    return {} as T;
  };
}

it("bootstraps Kael with the authenticated organization", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        agent_engine: "codex",
        agent_protocol_version: 1,
        instance_id: "kael-1",
        protocol_version: 1,
        capability_version: 1
      })
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new AgentClient();

  await client.bootstrap("resource-1");

  expect(fetchMock).toHaveBeenCalledWith(
    "/kael/api/v1/bootstrap",
    expect.objectContaining({ headers: expect.objectContaining({ "X-JMS-ORG": "org-1" }) })
  );
  client.dispose();
  vi.unstubAllGlobals();
});

it("creates a capability conversation, panel, context, and atomic registration snapshot", async () => {
  const requests: AgentHttpRequest[] = [];
  const client = new AgentClient(kaelRequest(requests));

  await expect(client.createSession(manifest, "auto")).resolves.toEqual({
    session_id: "panel-1",
    after: 0,
    registration_ids: { terminal_context: "registration-1" }
  });

  expect(requests.map((request) => [request.method, request.path])).toEqual([
    ["GET", "/kael/api/v1/bootstrap"],
    ["POST", "/kael/api/v1/conversations"],
    ["POST", "/kael/api/v1/panel-sessions"],
    ["PUT", "/kael/api/v1/panel-sessions/panel-1/context"],
    ["PUT", "/kael/api/v1/panel-sessions/panel-1/registrations"]
  ]);
  expect(requests.at(-1)?.body).toMatchObject({
    base_registry_revision: 0,
    registrations: [
      {
        name: "terminal_context",
        definition_version: "3",
        input_schema: manifest.tools[0]!.inputSchema
      }
    ]
  });
  client.dispose();
});

it("forwards the executor command policy without marking every shell call read-only", async () => {
  const requests: AgentHttpRequest[] = [];
  const client = new AgentClient(kaelRequest(requests));
  const commandTool = {
    name: "execute_shell",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
    annotations: { readOnlyHint: false, openWorldHint: true },
    _meta: { "com.jumpserver/commandPolicy": "shell-readonly-v1" }
  };
  try {
    await client.createSession({ ...manifest, tools: [commandTool] }, "auto");
    expect(requests.find((request) => request.path.endsWith("/registrations"))?.body).toMatchObject({
      registrations: [{ name: commandTool.name, annotations: commandTool.annotations, _meta: commandTool._meta }]
    });
  } finally {
    client.dispose();
  }
});

it("maps messages, runs, approvals, and tool results to canonical Kael resources", async () => {
  const requests: AgentHttpRequest[] = [];
  const client = new AgentClient(kaelRequest(requests));
  await client.createSession(manifest, "auto");

  await client.updateContext("panel-1", "resource-1", { selected_asset_id: "asset-1", ui_revision: 4 });

  await client.sendMessage("panel-1", "resource-1", {
    message_id: "message-1",
    idempotency_key: "send-1",
    role: "user",
    parts: [{ type: "text", text: "inspect" }]
  });
  await client.resolveApproval("panel-1", "resource-1", "approval-1", {
    decision: "approve",
    run_id: "run-1",
    digest: "digest-1"
  });
  await client.sendToolResult("panel-1", "resource-1", "tool-1", {
    jsonrpc: "2.0",
    id: "rpc-1",
    run_id: "run-1",
    seq: 1,
    done: true,
    status: "success",
    result: { ok: true }
  });

  expect(requests.find((request) => request.path.endsWith("/runs"))?.body).toMatchObject({
    conversation_id: "conversation-1",
    panel_session_id: "panel-1",
    capability_mode: "panel"
  });
  expect(requests.filter((request) => request.path.endsWith("/context")).at(-1)?.body).toMatchObject({
    base_version: 1,
    data: { selected_asset_id: "asset-1", ui_revision: 4 }
  });
  expect(requests.find((request) => request.path.includes("/approvals/"))?.body).toEqual({
    decision: "approve",
    run_id: "run-1",
    arguments_digest: "digest-1"
  });
  expect(requests.find((request) => request.path.includes("/tool-calls/"))?.body).toMatchObject({
    panel_session_id: "panel-1",
    seq: 1,
    done: true,
    status: "success"
  });
  client.dispose();
});

it.each([false, true])("sends reactive AI context, messages and results as JSON (desktop=%s)", async (isDesktop) => {
  const requests: AgentHttpRequest[] = [];
  const respond = kaelRequest(requests);
  runtime.desktop = isDesktop;
  desktop.invoke.mockImplementation(async (_command, { request }) => respond(structuredClone(request)));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      const data = await respond({
        path,
        method: init.method as AgentHttpRequest["method"],
        ...(init.body ? { body: JSON.parse(String(init.body)) } : {})
      });
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    })
  );
  const client = new AgentClient();
  try {
    await client.createSession({ ...manifest, profile: "workspace" }, "auto");
    const state = reactive({ default_terminal_target: { target_id: "target-1", asset_name: "host-a" } });
    // Spreading a reactive context unwraps only its root; the target remains a Vue Proxy.
    await client.updateContext("panel-1", "resource-1", { ...state });
    await client.sendMessage("panel-1", "resource-1", {
      message_id: "message-1",
      idempotency_key: "send-1",
      role: "user",
      parts: reactive([{ type: "text", text: "Inspect the current terminal" }])
    });
    await client.sendToolResult("panel-1", "resource-1", "tool-1", {
      jsonrpc: "2.0",
      id: "rpc-1",
      run_id: "run-1",
      seq: 1,
      done: true,
      status: "success",
      result: reactive({ tasks: [{ task_id: "task-1", status: "completed" }] })
    });
    state.default_terminal_target.asset_name = "host-b";
    expect(requests.filter((request) => request.path.endsWith("/context")).at(-1)?.body).toMatchObject({
      data: { default_terminal_target: { target_id: "target-1", asset_name: "host-a" } }
    });
    expect(requests.find((request) => request.path.endsWith("/messages"))?.body).toMatchObject({
      parts: [{ type: "text", text: "Inspect the current terminal" }]
    });
    expect(requests.find((request) => request.path.includes("/tool-calls/"))?.body).toMatchObject({
      result: { tasks: [{ task_id: "task-1", status: "completed" }] }
    });
  } finally {
    client.dispose();
    runtime.desktop = false;
    desktop.invoke.mockReset();
    vi.unstubAllGlobals();
  }
});

it("preserves structured Kael errors across web and Electron requests", async () => {
  const body = JSON.stringify({ code: "approval_expired", detail: "approval has expired" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => body }));
  const client = new AgentClient();
  try {
    await expect(client.getApproval("expired")).rejects.toMatchObject({ status: 409, code: "approval_expired" });
    runtime.desktop = true;
    desktop.invoke.mockRejectedValue(
      new Error(`Error invoking remote method 'desktop:invoke': Error: api request failed: status=409, body=${body}`)
    );
    await expect(client.getApproval("expired")).rejects.toMatchObject({ status: 409, code: "approval_expired" });
    expect(new AgentHttpError(502, "Bad Gateway").code).toBe("");
  } finally {
    runtime.desktop = false;
    vi.unstubAllGlobals();
    client.dispose();
  }
});

it("rejects a Kael server without the harness contract before creating a panel", async () => {
  const requests: AgentHttpRequest[] = [];
  const client = new AgentClient(async <T>(request: AgentHttpRequest): Promise<T> => {
    requests.push(request);
    return { instance_id: "kael-old", protocol_version: 1, capability_version: 1 } as T;
  });
  await expect(client.createSession(manifest, "auto")).rejects.toThrow("requires the Codex harness");
  expect(requests).toHaveLength(1);
  client.dispose();
});
