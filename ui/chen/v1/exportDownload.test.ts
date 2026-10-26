import { beforeEach, expect, it, vi } from "vitest";
import { downloadGoExport } from "./exportDownload";
const runtime = vi.hoisted(() => ({ save: vi.fn(), invoke: vi.fn() }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => true }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopDialog: { save: runtime.save }, desktopInvoke: runtime.invoke }));
beforeEach(() => {
  vi.clearAllMocks();
});
it("desktop save cancellation does not mint or consume a short-lived ticket", async () => {
  runtime.save.mockResolvedValue(null);
  const getTicket = vi.fn();
  expect(await downloadGoExport(getTicket, "result.csv")).toBe("cancelled");
  expect(getTicket).not.toHaveBeenCalled();
  expect(runtime.invoke).not.toHaveBeenCalled();
});
it("desktop chooses the destination before fetching the one-use download ticket", async () => {
  const order: string[] = [];
  runtime.save.mockImplementation(async () => {
    order.push("choose-path");
    return "/tmp/result.xlsx";
  });
  runtime.invoke.mockResolvedValue("saved");
  const getTicket = vi.fn(async () => {
    order.push("mint-ticket");
    return {
      method: "POST" as const,
      download_url: "jms-app://app/chen/api/v1/downloads",
      fields: { ticket: "short-lived" },
      expires_at: "soon"
    };
  });
  expect(await downloadGoExport(getTicket, "result.xlsx")).toBe("saved");
  expect(order).toEqual(["choose-path", "mint-ticket"]);
  expect(runtime.invoke).toHaveBeenCalledWith("download_chen_export", {
    url: "jms-app://app/chen/api/v1/downloads",
    filePath: "/tmp/result.xlsx",
    ticket: "short-lived"
  });
});
