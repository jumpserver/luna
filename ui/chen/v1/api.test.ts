import { afterEach, expect, it, vi } from "vitest";
import { createChenGoApi } from "./api";

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
