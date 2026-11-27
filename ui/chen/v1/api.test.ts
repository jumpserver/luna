import { afterEach, expect, it, vi } from "vitest";
import { createChenGoApi, type GoCatalogRelation } from "./api";
import { objectKey } from "./catalogIdentity";
import { diagramObjectId } from "./diagram";

afterEach(() => vi.unstubAllGlobals());

it("keeps download tickets on the selected KoKo endpoint in the browser and Electron", async () => {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const remote = "https://connector.example";
  const route = "/koko/chen/api/v1/downloads";
  vi.stubGlobal("withWebSitePrefix", (path: string) => "/site" + path);
  for (const [desktop, endpoint, expected] of [
    [false, origin, "/site" + route],
    [false, remote, remote + route],
    [true, remote, "jms-app://app" + route + "?__jms_chen_endpoint=" + encodeURIComponent(remote)]
  ] as const) {
    vi.stubGlobal("isElectronRuntime", () => desktop);
    const fetchTicket = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ method: "POST", download_url: route, fields: { ticket: "export-ticket" } }));
    const api = createChenGoApi(endpoint, fetchTicket, { mode: "single" });
    const ticket = await api.exportDownloadTicket("export-1");
    expect(fetchTicket).toHaveBeenCalledWith(
      expected.replace("/downloads", "/exports/export-1/download-ticket"),
      expect.objectContaining({ method: "POST", credentials: "omit" })
    );
    expect(ticket.download_url).toBe(expected);
    expect(ticket.fields.ticket).toBe("export-ticket");

    fetchTicket.mockResolvedValue(
      Response.json({ method: "POST", download_url: "/chen/api/v1/downloads", fields: ticket.fields })
    );
    await expect(api.exportDownloadTicket("export-1")).rejects.toMatchObject({ code: "invalid_download_ticket" });
  }
});

it("lists relations using the original objects wire contract", async () => {
  vi.stubGlobal("isElectronRuntime", () => false);
  vi.stubGlobal("withWebSitePrefix", (path: string) => path);
  const view: GoCatalogRelation = {
    database: "db",
    schema: "s",
    name: "m",
    kind: "view",
    object_type: "materialized_view"
  };
  const page = { items: [view], has_more: false };
  const fetchPage = vi.fn<typeof fetch>().mockResolvedValue(Response.json(page));
  const api = createChenGoApi("", fetchPage, { mode: "single" });
  await expect(api.catalogRelations("sid", { schema: "s", q: "%", cursor: "next" })).resolves.toEqual(page);
  const url = new URL(String(fetchPage.mock.calls[0]![0]), "http://localhost");
  expect(url.pathname).toBe("/koko/chen/api/v1/sessions/sid/catalog/objects");
  expect(Object.fromEntries(url.searchParams)).toEqual({ schema: "s", q: "%", cursor: "next", limit: "100" });
});

it("uses one scoped identity across catalog and diagram views", () => {
  const view: GoCatalogRelation = { database: "db", schema: "a.b", kind: "view", name: "C" };
  const key = objectKey(view, "s1");
  expect(diagramObjectId("s1", view)).toBe(key);
  expect(objectKey({ ...view, comment: "updated" }, "s1")).toBe(key);
  expect(
    new Set([
      key,
      objectKey(view, "s2"),
      objectKey({ ...view, schema: "a", name: "b.C" }, "s1"),
      objectKey({ ...view, name: "c" }, "s1"),
      objectKey({ ...view, kind: "table" }, "s1")
    ]).size
  ).toBe(5);
});
