import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { resolveWsUrl } from "@jumpserver/connectors-core";
import { monitorEndpointUrl, useSessionMonitor } from "./useSessionMonitor";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  endpoint: vi.fn(),
  fetch: vi.fn(),
  ticket: vi.fn(),
  toast: vi.fn(),
  mounted: vi.fn(),
  desktop: false
}));
vi.mock("~/composables/useApiRequest", () => ({ apiRequest: mocks.request, getSmartEndpoint: mocks.endpoint }));
vi.mock("~/lion/hooks/useLionConnectTicket", () => ({ createLionConnectTicket: mocks.ticket }));
vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ currentSite: "https://desktop.example:8443" })
}));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => mocks.desktop }));
vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: mocks.mounted,
  onBeforeUnmount: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.desktop = false;
  vi.stubGlobal("window", { location: { origin: "https://web.example" } });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: mocks.toast }));
  vi.stubGlobal("useColorMode", () => ({ value: "dark" }));
  vi.stubGlobal("useWorkspaceTabs", () => ({ activePaneId: ref("") }));
  vi.stubGlobal("useAuthSession", () => ({ bootstrapPersistedSession: async () => {} }));
  mocks.request.mockResolvedValue({
    id: "session",
    user: "user",
    asset: "asset",
    account: "account",
    protocol: "http",
    terminal: { type: "koko" },
    type: { value: "normal" },
    can_join: true,
    is_locked: false,
    org_id: "org"
  });
  mocks.endpoint.mockResolvedValue({ host: "endpoint.example", https_port: 9443 });
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ component: "lion" }) });
  mocks.ticket.mockResolvedValue("ticket");
});
afterEach(() => vi.unstubAllGlobals());

it.each(["koko", "lion"])("enters the %s monitor selected by the running session", async (component) => {
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ component }) });
  const state = useSessionMonitor("session");
  await mocks.mounted.mock.calls[0]![0]();
  expect(mocks.endpoint).toHaveBeenCalledWith({ protocol: "https", sessionId: "session" }, "org");
  expect(String(mocks.fetch.mock.calls[0]![0])).toBe(
    "https://endpoint.example:9443/koko/api/monitor/session/?ticket=ticket"
  );
  expect(state.component.value).toBe(component);
  expect(resolveWsUrl(component as "koko" | "lion", "terminal", state.sessionContext.value!)).toBe(
    "wss://endpoint.example:9443/koko/ws/monitor/?ticket=ticket&type=monitor&target_id=session"
  );
});

it("uses the desktop site protocol and preserves its port for a default endpoint", async () => {
  mocks.desktop = true;
  mocks.endpoint.mockResolvedValue({ https_port: 0 });
  const state = useSessionMonitor("session");
  await mocks.mounted.mock.calls[0]![0]();
  expect(state.endpointUrl.value).toBe("https://desktop.example:8443");
});

it("does not connect finished sessions", async () => {
  mocks.request.mockResolvedValue({ is_finished: true, can_join: true, terminal: { type: "koko" } });
  const state = useSessionMonitor("session");
  await mocks.mounted.mock.calls[0]![0]();
  expect(state.error.value).toBe("Monitor.Unavailable");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it.each(["", "ticket-id"])(
  "uses the matching lock API for ticket %s and only updates accepted tasks",
  async (ticketId) => {
    const state = useSessionMonitor("session", ticketId);
    await mocks.mounted.mock.calls[0]![0]();
    mocks.request.mockResolvedValue({ ok: ["session"] });
    await state.togglePause();
    expect(mocks.request).toHaveBeenLastCalledWith({
      method: "POST",
      path: `/api/v1/terminal/tasks/toggle-lock-session${ticketId ? "-for-ticket" : ""}/`,
      orgId: "org",
      body: { session_id: "session", task_name: "lock_session" }
    });
    if (!ticketId) {
      mocks.request.mockResolvedValue({ ok: [] });
      await state.togglePause();
      expect(mocks.toast).toHaveBeenLastCalledWith({ title: "Monitor.Unavailable", color: "error" });
    }
    expect(state.session.value?.is_locked).toBe(true);
  }
);

it("resolves HTTP ports and unbracketed IPv6 hosts", () => {
  expect(monitorEndpointUrl({ host: "remote.example", http_port: 8080 }, "http://web.example:3000")).toBe(
    "http://remote.example:8080"
  );
  expect(monitorEndpointUrl({ host: "::1", https_port: 9443 }, "https://web.example")).toBe("https://[::1]:9443");
});
