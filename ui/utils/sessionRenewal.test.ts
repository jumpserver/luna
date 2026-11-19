import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reactive } from "vue";

const mocks = vi.hoisted(() => ({ request: vi.fn(), store: { loggedIn: true } }));
vi.mock("~/composables/useApiRequest", () => ({ apiRequest: mocks.request }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mocks.store }));
vi.stubGlobal("defineNuxtPlugin", (plugin: unknown) => plugin);
const install = (await import("../plugins/session-renewal.client")).default as unknown as (app: {
  vueApp: { onUnmount: (dispose: () => void) => void };
}) => void;

const events = ["keydown", "pointerdown", "pointermove", "wheel"];
let route: { path: string };
let clock: number;
let dispose: () => void;
let listeners: Map<string, { callback: EventListener; signal: AbortSignal }>;

beforeEach(() => {
  route = reactive({ path: "/" });
  clock = 0;
  listeners = new Map();
  mocks.store.loggedIn = true;
  mocks.request.mockReset().mockResolvedValue(null);
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("document", {
    addEventListener: (type: string, callback: EventListener, options: AddEventListenerOptions) => {
      listeners.set(type, { callback, signal: options.signal! });
    }
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  install({ vueApp: { onUnmount: (callback) => (dispose = callback) } });
});

afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function activity(type = "pointerdown", isTrusted = true) {
  listeners.get(type)!.callback({ type, isTrusted } as Event);
}

async function settleRequest() {
  await Promise.resolve();
  await Promise.resolve();
}

it.each(["/chen", "/chen/"])("does not renew Core from %s with a persisted logged-in session", (path) => {
  route.path = path;
  for (const type of events) activity(type);
  expect(mocks.request).not.toHaveBeenCalled();

  // Ignored standalone activity must not consume the managed renewal interval.
  route.path = "/";
  activity();
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith({
    method: "GET",
    path: "/api/v1/health/",
    headers: { "Cache-Control": "no-cache" },
    timeoutMs: 10_000
  });
});

it("uses the current route when switching between managed and standalone without remounting", async () => {
  activity();
  expect(mocks.request).toHaveBeenCalledOnce();
  await settleRequest();
  clock = 20_000;
  route.path = "/chen/";
  for (const type of events) activity(type);
  expect(mocks.request).toHaveBeenCalledOnce();

  route.path = "/setting/application";
  expect(mocks.request).toHaveBeenCalledOnce();
  activity("keydown");
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it.each([
  { loggedIn: true, trusted: false },
  { loggedIn: false, trusted: true }
])("ignores activity with loggedIn=$loggedIn and isTrusted=$trusted", ({ loggedIn, trusted }) => {
  mocks.store.loggedIn = loggedIn;
  for (const type of events) activity(type, trusted);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("keeps the shared throttle and in-flight guard for managed activity", async () => {
  const pending = Promise.withResolvers<null>();
  mocks.request.mockReturnValueOnce(pending.promise);
  activity();
  clock = 20_000;
  activity("wheel");
  expect(mocks.request).toHaveBeenCalledOnce();
  pending.resolve(null);
  await settleRequest();
  activity("keydown");
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await settleRequest();
  clock = 20_001;
  activity("pointermove");
  expect(mocks.request).toHaveBeenCalledTimes(2);
  clock = 30_000;
  activity();
  expect(mocks.request).toHaveBeenCalledTimes(3);
});

it("removes all activity listeners when the application unmounts", () => {
  expect([...listeners.keys()]).toEqual(events);
  expect([...listeners.values()].every(({ signal }) => !signal.aborted)).toBe(true);
  dispose();
  expect([...listeners.values()].every(({ signal }) => signal.aborted)).toBe(true);
});
