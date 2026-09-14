import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  ApiRequestError,
  createConnectionToken,
  favoriteAssetsToFolder,
  getAuthorizedAssets,
  getConnectionRdpFile,
  getSessionOnlineNum,
  updateLunaPreferences
} from "./useApiRequest";

const { desktopInvoke } = vi.hoisted(() => ({ desktopInvoke: vi.fn() }));

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke }));
vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ loggedIn: false, orgId: "org-current" })
}));

describe("API request headers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])("patches only the selected Luna preference (desktop=%s)", async (desktop) => {
    const body = { graphics: { rdp_resolution: "1024x768" } };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body)));
    vi.stubGlobal("isDesktopRuntime", () => desktop);
    vi.stubGlobal("withWebSitePrefix", (path: string) => `/site/test${path}`);
    vi.stubGlobal("getWebApiMutationHeaders", () => ({ "X-CSRFToken": "csrf" }));
    vi.stubGlobal("fetch", fetch);
    desktopInvoke.mockResolvedValue(body);
    await expect(updateLunaPreferences(body)).resolves.toEqual(body);
    if (desktop) {
      expect(desktopInvoke).toHaveBeenCalledWith("api_request", {
        request: {
          method: "PATCH",
          path: "/api/v1/users/preference/",
          query: { category: "luna" },
          body,
          orgId: "org-current"
        }
      });
    } else {
      expect(fetch).toHaveBeenCalledWith(
        "/site/test/api/v1/users/preference/?category=luna",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(body),
          credentials: "include",
          headers: expect.objectContaining({ "X-CSRFToken": "csrf" })
        })
      );
    }
  });

  it("downloads RDP text through the selected site's authenticated API and asset organization", async () => {
    const content = "full address:s:rdp.example\r\nusername:s:用户\r\n";
    const fetch = vi.fn(async () => new Response(content, { headers: { "Content-Type": "application/octet-stream" } }));
    const headers = vi.fn(() => ({ "X-JMS-ORG": "asset-org" }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => `/site/test${path}`);
    vi.stubGlobal("getWebApiHeaders", headers);
    vi.stubGlobal("fetch", fetch);
    await expect(getConnectionRdpFile("token/id", { width: "1600" }, "asset-org")).resolves.toBe(content);
    expect(headers).toHaveBeenCalledWith("asset-org");
    expect(fetch).toHaveBeenCalledWith(
      "/site/test/api/v1/authentication/connection-token/token%2Fid/rdp-file/?width=1600",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json", "X-JMS-ORG": "asset-org" }
      })
    );
  });

  it("queries the authorized asset endpoint with bounded pagination and display fields", async () => {
    const fetch = vi.fn(
      async (_request: string) =>
        new Response(JSON.stringify({ count: 2, next: null, results: [] }), {
          headers: { "Content-Type": "application/json" }
        })
    );
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiHeaders", () => ({}));
    vi.stubGlobal("fetch", fetch);
    await getAuthorizedAssets({ limit: 20, offset: 0 }, "org-1");
    const url = new URL(String(fetch.mock.calls[0]?.[0]), "https://luna.test");
    expect(url.pathname).toBe("/api/v1/perms/users/self/assets/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
      offset: "0",
      fields: "id,name,address,org_id,is_active",
      order: "name"
    });
  });

  it("includes mutation headers for DELETE requests without a body", async () => {
    const getWebApiMutationHeaders = vi.fn(() => ({ "X-CSRFToken": "csrf-token" }));
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiHeaders", () => ({}));
    vi.stubGlobal("getWebApiMutationHeaders", getWebApiMutationHeaders);
    vi.stubGlobal("fetch", fetch);

    await apiRequest<void>({ method: "DELETE", path: "/kael/api/v1/conversations/conversation-1" });

    expect(getWebApiMutationHeaders).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/kael/api/v1/conversations/conversation-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-CSRFToken": "csrf-token" })
      })
    );
  });

  it("adds selected assets to a favorite target in one request", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
    vi.stubGlobal("fetch", fetch);

    await favoriteAssetsToFolder(["asset-1", "asset-2"], "folder-1");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assets/favorite-assets/batch/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ assets: ["asset-1", "asset-2"], folder: "folder-1" })
      })
    );
  });

  it("adds selected assets directly to all favorites", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiMutationHeaders", () => ({}));
    vi.stubGlobal("fetch", fetch);

    await favoriteAssetsToFolder(["asset-1"], null);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assets/favorite-assets/batch/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ assets: ["asset-1"], folder: null })
      })
    );
  });

  it("queries online session count by asset and account", async () => {
    const fetch = vi.fn(
      async (_request: string) =>
        new Response(JSON.stringify({ count: 3 }), {
          headers: { "Content-Type": "application/json" }
        })
    );
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiHeaders", () => ({}));
    vi.stubGlobal("fetch", fetch);

    await expect(getSessionOnlineNum("asset-1", "admin")).resolves.toEqual({ count: 3 });

    const url = new URL(String(fetch.mock.calls[0]?.[0]), "https://luna.test");
    expect(url.pathname).toBe("/api/v1/terminal/sessions/online-info/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      asset_id: "asset-1",
      account: "admin"
    });
  });

  it("scopes desktop requests to the current organization without waiting for session IPC", async () => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    desktopInvoke.mockResolvedValueOnce([]);

    await apiRequest({ method: "GET", path: "/api/v1/assets/favorite-assets/" });

    expect(desktopInvoke).toHaveBeenCalledWith("api_request", {
      request: {
        method: "GET",
        path: "/api/v1/assets/favorite-assets/",
        orgId: "org-current"
      }
    });
  });

  it("posts admin connection tokens to the console endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "token-1" }), { status: 201 }));
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiHeaders", () => ({ "X-JMS-ORG": "org-1" }));
    vi.stubGlobal("getWebApiMutationHeaders", () => ({ "X-JMS-ORG": "org-1", "X-CSRFToken": "csrf" }));
    vi.stubGlobal("fetch", fetch);

    await createConnectionToken(
      { asset: "asset-1", account: "account-1", protocol: "ssh", connect_method: "web_cli" },
      "org-1",
      { admin: true }
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/authentication/admin-connection-token/",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ "X-JMS-ORG": "org-1", "X-CSRFToken": "csrf" })
      })
    );
  });
});

describe("API error summaries", () => {
  afterEach(() => vi.unstubAllGlobals());

  const html = `<!doctype html><html><head><title>Server Error (500)</title></head><body>${"<pre>traceback and settings</pre>".repeat(
    1000
  )}</body></html>`;

  it("omits HTML from both the web error message and its logged data", async () => {
    vi.stubGlobal("isDesktopRuntime", () => false);
    vi.stubGlobal("withWebSitePrefix", (path: string) => path);
    vi.stubGlobal("getWebApiHeaders", () => ({}));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 500 }))
    );
    await expect(apiRequest({ method: "GET", path: "/api/test/" })).rejects.toMatchObject({
      status: 500,
      message: "HTML response omitted: Server Error (500)",
      data: "HTML response omitted: Server Error (500)"
    });
  });

  it("still parses desktop status and structured errors with request context", async () => {
    vi.stubGlobal("isDesktopRuntime", () => true);
    desktopInvoke.mockRejectedValueOnce(
      new Error('api POST /api/test/: api request failed: status=403, body={"code":"acl_error","detail":"Denied"}')
    );
    await expect(apiRequest({ method: "POST", path: "/api/test/" })).rejects.toMatchObject({
      status: 403,
      message: "Denied",
      data: { code: "acl_error", detail: "Denied" }
    });
  });

  it("preserves structured validation data", () => {
    const data = { code: "invalid", fields: { name: ["Required"] } };
    expect(new ApiRequestError(400, data).data).toBe(data);
  });
});
