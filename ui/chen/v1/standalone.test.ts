import { afterEach, describe, expect, it, vi } from "vitest";
import { createChenGoApi } from "./api";
import { chenSelectorFromQuery, isChenSingleRoute } from "./standalone";

vi.mock("~/chen/api/client", () => ({
  chenPath: (path: string, endpoint: string) => `${endpoint}/chen${path}`,
  buildHeaders: vi.fn(() => {
    throw new Error("Standalone must not read Core headers");
  })
}));
afterEach(() => vi.unstubAllGlobals());

describe("standalone route boundary", () => {
  it("exempts only the direct Chen entry from managed authentication", () => {
    for (const path of ["/chen", "/chen/"]) expect(isChenSingleRoute(path)).toBe(true);
    for (const path of ["/", "/chen/api", "/chen-other", "/foo/chen", "/session/chen", "/auth/browser"])
      expect(isChenSingleRoute(path)).toBe(false);
  });
  it("accepts a selector without taking database protocols or credentials from the URL", () => {
    expect(chenSelectorFromQuery(" local-pg ")).toBe("local-pg");
    for (const value of [undefined, "", ["a", "b"], "a\u0000b", "x".repeat(129)])
      expect(chenSelectorFromQuery(value)).toBe("");
  });
});

describe("single-mode API", () => {
  it("discovers mode, sends only selector and request_id, and omits ambient credentials", async () => {
    vi.stubGlobal("getWebApiMutationHeaders", () => {
      throw new Error("Core mutation headers must not be read");
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ mode: "single" }))
      .mockResolvedValueOnce(Response.json({ token: "private-session", session: { id: "sid", dialect: "postgresql" } }))
      .mockResolvedValueOnce(Response.json({ id: "sid" }));
    const api = createChenGoApi("http://127.0.0.1:8082", fetcher, { mode: "single" });
    expect((await api.authenticateSelector("local-pg")).dialect).toBe("postgresql");
    await api.getSession("sid");
    expect(fetcher.mock.calls[0]![0]).toBe("http://127.0.0.1:8082/chen/api/v1/capabilities");
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({
      selector: "local-pg",
      request_id: expect.any(String)
    });
    expect(fetcher.mock.calls.every((call) => call[1]?.credentials === "omit")).toBe(true);
    expect(fetcher.mock.calls[2]![1]?.headers).toEqual({ token: "private-session" });
  });
  it("refuses a managed endpoint before creating a session and never falls back to Core authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ mode: "managed" }));
    const api = createChenGoApi("http://127.0.0.1:8082", fetcher, { mode: "single" });
    await expect(api.authenticateSelector("local-mysql")).rejects.toMatchObject({ code: "mode_mismatch" });
    await expect(api.authenticate("core-token")).rejects.toMatchObject({ code: "mode_mismatch" });
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(
      createChenGoApi("http://127.0.0.1:8082", fetcher).authenticateSelector("local-mysql")
    ).rejects.toMatchObject({ code: "mode_mismatch" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps a retry within one workspace independent from another workspace using the same selector", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ mode: "single" }))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ mode: "single" }))
      .mockResolvedValueOnce(Response.json({ token: "one", session: { id: "one" } }))
      .mockResolvedValueOnce(Response.json({ mode: "single" }))
      .mockResolvedValueOnce(Response.json({ token: "two", session: { id: "two" } }));
    const one = createChenGoApi("http://127.0.0.1:8082", fetcher, { mode: "single" });
    await expect(one.authenticateSelector("local-mysql")).rejects.toThrow();
    await one.authenticateSelector("local-mysql");
    await createChenGoApi("http://127.0.0.1:8082", fetcher, { mode: "single" }).authenticateSelector("local-mysql");
    const body = (index: number) => JSON.parse(String(fetcher.mock.calls[index]![1]?.body));
    expect(body(1)).toEqual(body(3));
    expect(body(5).selector).toBe(body(3).selector);
    expect(body(5).request_id).not.toBe(body(3).request_id);
  });
});
