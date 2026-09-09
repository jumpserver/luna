import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, favoriteAssetsToFolder, getAuthorizedAssets, getSessionOnlineNum } from "./useApiRequest";

const { desktopInvoke } = vi.hoisted(() => ({ desktopInvoke: vi.fn() }));

vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke }));
vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ loggedIn: false, orgId: "org-current" })
}));

describe("API request headers", () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
