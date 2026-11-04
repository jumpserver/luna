import { afterEach, expect, it, vi } from "vitest";
import { chenPath } from "./client";

const location = vi.hoisted(() => ({ origin: "https://jumpserver.example" }));
vi.mock("~/utils/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/runtime")>()),
  pageLocation: () => ({ origin: location.origin })
}));

afterEach(() => vi.unstubAllGlobals());

it.each(["http://127.0.0.1:3000", "jms-app://app"])("uses Electron's session proxy from %s", (origin) => {
  location.origin = origin;
  vi.stubGlobal("isElectronRuntime", () => true);
  const url = new URL(chenPath("/api/v1/sessions", "https://jumpserver.example"));
  expect(url.protocol).toBe("jms-app:");
  expect(url.host).toBe("app");
  expect(url.pathname).toBe("/chen/api/v1/sessions");
  expect(url.searchParams.get("__jms_chen_endpoint")).toBe("https://jumpserver.example");
});

it("preserves web routing for same-origin and remote connectors", () => {
  location.origin = "https://jumpserver.example";
  vi.stubGlobal("isElectronRuntime", () => false);
  vi.stubGlobal("withWebSitePrefix", (path: string) => `/site${path}`);
  expect(chenPath("/api/v1/sessions")).toBe("/site/chen/api/v1/sessions");
  expect(chenPath("/api/v1/sessions", "https://chen.example")).toBe("https://chen.example/chen/api/v1/sessions");
});
