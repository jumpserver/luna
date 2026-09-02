import type { AgentHttpRequest } from "#koko/composables/agent/agentClient";
import { expect, it, vi } from "vitest";
import { AgentClient, AgentHttpError } from "#koko/composables/agent/agentClient";

vi.mock("~/utils/runtime", () => ({
  getDesktopRuntime: () => "web",
  getWebApiHeaders: () => ({ "X-JMS-ORG": "org-1" }),
  isDesktopRuntime: () => false,
  isElectronRuntime: () => false,
  withWebSitePrefix: (path: string) => path
}));

it("reports only the final Agent resource release", () => {
  const client = new AgentClient();
  client.retainResource("resource-1");
  client.retainResource("resource-1");

  expect(client.releaseResource("resource-1")).toBe(false);
  expect(client.releaseResource("resource-1")).toBe(true);
  client.dispose();
});

it("includes the authenticated web organization in Agent bootstrap", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        csrf_token: "csrf",
        expires_at: Date.now() + 20 * 60_000,
        refresh_at: Date.now() + 10 * 60_000,
        instance_id: "agent-1",
        protocol_version: 1,
        capability_version: 1
      })
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new AgentClient();

  await client.bootstrap("resource-1");

  expect(fetchMock).toHaveBeenCalledWith(
    "/koko/agent/sessions/bootstrap",
    expect.objectContaining({
      cache: "no-store",
      headers: expect.objectContaining({
        "X-JMS-ORG": "org-1",
        "X-Resource-Session-ID": "resource-1"
      })
    })
  );
  client.dispose();
  vi.unstubAllGlobals();
});

it("keeps Koko Agent CSRF bootstrap tokens scoped to the resource session", async () => {
  const requests: AgentHttpRequest[] = [];
  const request = async <T>(value: AgentHttpRequest): Promise<T> => {
    requests.push(value);
    if (value.method === "GET") {
      return {
        csrf_token: `csrf:${value.headers?.["X-Resource-Session-ID"]}`,
        expires_at: Date.now() + 20 * 60_000,
        refresh_at: Date.now() + 10 * 60_000,
        instance_id: "agent-1",
        protocol_version: 1,
        capability_version: 1
      } as T;
    }
    return { session_id: `agent-${requests.length}` } as T;
  };
  const client = new AgentClient(request);
  const manifest = {
    profile: "terminal" as const,
    resourceSessionId: "resource-1",
    revision: 1,
    tools: []
  };

  await client.createSession(manifest, "auto");
  await client.createSession(manifest, "always");
  await client.createSession({ ...manifest, resourceSessionId: "resource-2" }, "never");
  await client.bootstrap("resource-1", true);

  expect(requests.filter((value) => value.method === "GET")).toHaveLength(3);
  expect(requests[1]?.headers).toMatchObject({
    "Agent-Protocol-Version": "1",
    "Agent-Capability-Version": "1",
    "X-Resource-Session-ID": "resource-1",
    "X-Koko-Agent-CSRF": "csrf:resource-1"
  });
  expect(requests[1]?.body).toMatchObject({
    profile: "terminal",
    resource_session_id: "resource-1",
    approval_mode: "auto"
  });
  expect(requests.at(-1)?.headers).toMatchObject({
    "X-Resource-Session-ID": "resource-1",
    "X-Koko-Agent-CSRF": "csrf:resource-1"
  });
  client.dispose();
});

it("recovers an expired bootstrap token without discarding it on network errors", async () => {
  const requests: AgentHttpRequest[] = [];
  let csrf = "expired";
  let anonymousBootstrapCount = 0;
  let rejectRefresh = true;
  const response = () => ({
    csrf_token: csrf,
    expires_at: Date.now() + 20 * 60_000,
    refresh_at: Date.now() + 10 * 60_000,
    instance_id: "agent-1",
    protocol_version: 1,
    capability_version: 1
  });
  const request = async <T>(value: AgentHttpRequest): Promise<T> => {
    requests.push(value);
    if (value.headers?.["X-Koko-Agent-CSRF"] === "expired" && rejectRefresh) {
      rejectRefresh = false;
      throw new Error("temporary connection failure");
    }
    if (value.headers?.["X-Koko-Agent-CSRF"] === "expired") throw new AgentHttpError(403, "csrf expired");
    if (value.method === "GET") {
      anonymousBootstrapCount += 1;
      csrf = anonymousBootstrapCount === 1 ? "expired" : "renewed";
      return response() as T;
    }
    return {} as T;
  };
  const client = new AgentClient(request);

  await client.bootstrap("resource-1");
  await expect(client.bootstrap("resource-1", true)).rejects.toThrow("temporary connection failure");
  await client.bootstrap("resource-1", true);

  const refreshes = requests.filter((value) => value.method === "GET").slice(1);
  expect(refreshes.map((value) => value.headers?.["X-Koko-Agent-CSRF"])).toEqual(["expired", "expired", undefined]);
  client.dispose();
});

it("refreshes CSRF and retries a rejected write once", async () => {
  const requests: AgentHttpRequest[] = [];
  let bootstrapCount = 0;
  let rejected = false;
  const request = async <T>(value: AgentHttpRequest): Promise<T> => {
    requests.push(value);
    if (value.method === "GET") {
      bootstrapCount += 1;
      return {
        csrf_token: bootstrapCount === 1 ? "expired" : "renewed",
        expires_at: Date.now() + 20 * 60_000,
        refresh_at: Date.now() + 10 * 60_000,
        instance_id: "agent-1",
        protocol_version: 1,
        capability_version: 1
      } as T;
    }
    if (!rejected) {
      rejected = true;
      throw new AgentHttpError(403, "csrf expired");
    }
    return { session_id: "agent-1" } as T;
  };
  const client = new AgentClient(request);

  await client.createSession(
    {
      profile: "terminal",
      resourceSessionId: "resource-1",
      revision: 1,
      tools: []
    },
    "auto"
  );

  expect(requests.map((value) => [value.method, value.headers?.["X-Koko-Agent-CSRF"]])).toEqual([
    ["GET", undefined],
    ["POST", "expired"],
    ["GET", undefined],
    ["POST", "renewed"]
  ]);
  client.dispose();
});

it("pins each resource to its first Agent instance across CSRF refreshes", async () => {
  let instanceId = "agent-1";
  const request = vi.fn(async () => {
    return {
      csrf_token: `csrf:${instanceId}`,
      expires_at: Date.now() + 20 * 60_000,
      refresh_at: Date.now() + 10 * 60_000,
      instance_id: instanceId,
      protocol_version: 1,
      capability_version: 1
    };
  });
  const client = new AgentClient(<T>() => request() as Promise<T>);

  await client.bootstrap("resource-1");
  instanceId = "agent-2";
  await expect(client.bootstrap("resource-1", true)).rejects.toMatchObject({ code: "agent_instance_changed" });

  client.releaseResource("resource-1");
  await expect(client.bootstrap("resource-1")).resolves.toMatchObject({ instance_id: "agent-2" });
  expect(request).toHaveBeenCalledTimes(3);
  client.dispose();
});

it("posts an approval mode change through the session-scoped write endpoint", async () => {
  const requests: AgentHttpRequest[] = [];
  const request = async <T>(value: AgentHttpRequest): Promise<T> => {
    requests.push(value);
    if (value.method === "GET") {
      return {
        csrf_token: "csrf",
        expires_at: Date.now() + 20 * 60_000,
        refresh_at: Date.now() + 10 * 60_000,
        instance_id: "agent-1",
        protocol_version: 1,
        capability_version: 1
      } as T;
    }
    return { mode: "never", previous: "auto", cursor: 2 } as T;
  };
  const client = new AgentClient(request);

  await client.setApprovalMode("agent-1", "resource-1", { mode: "never" });

  expect(requests[1]).toMatchObject({
    method: "POST",
    path: "/koko/agent/sessions/agent-1/approval-mode",
    body: { mode: "never" },
    headers: {
      "X-Resource-Session-ID": "resource-1",
      "X-Koko-Agent-CSRF": "csrf"
    }
  });
  client.dispose();
});

it.each([404, 410])("treats an already absent Agent session as successfully deleted (%s)", async (status) => {
  const requests: AgentHttpRequest[] = [];
  const request = async <T>(value: AgentHttpRequest): Promise<T> => {
    requests.push(value);
    if (value.method === "GET") {
      return {
        csrf_token: "csrf",
        expires_at: Date.now() + 20 * 60_000,
        refresh_at: Date.now() + 10 * 60_000,
        instance_id: "agent-1",
        protocol_version: 1,
        capability_version: 1
      } as T;
    }
    throw new AgentHttpError(status, "session absent");
  };
  const client = new AgentClient(request);

  await expect(client.deleteSession("agent-1", "resource-1")).resolves.toBeUndefined();
  expect(requests.at(-1)).toMatchObject({
    method: "DELETE",
    path: "/koko/agent/sessions/agent-1"
  });
  client.dispose();
});
