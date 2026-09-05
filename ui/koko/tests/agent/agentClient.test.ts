import type { AgentHttpRequest } from "#koko/composables/agent/agentClient";
import { expect, it, vi } from "vitest";
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
      return { instance_id: "kael-1", protocol_version: 1, capability_version: 1 } as T;
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
    text: async () => JSON.stringify({ instance_id: "kael-1", protocol_version: 1, capability_version: 1 })
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
