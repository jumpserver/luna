import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./useApiRequest";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ loggedIn: false })
}));

describe("API request headers", () => {
  afterEach(() => vi.unstubAllGlobals());

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
});
