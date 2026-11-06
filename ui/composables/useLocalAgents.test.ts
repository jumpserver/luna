import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAgentsSnapshot } from "~/shared/agents/types";
import { useLocalAgents } from "./useLocalAgents";

const harness = vi.hoisted(() => ({
  desktop: true,
  mount: undefined as undefined | (() => Promise<void>),
  dispose: undefined as undefined | (() => void),
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  receive: undefined as undefined | ((event: { payload: LocalAgentsSnapshot }) => void)
}));

vi.mock("vue", async (original) => ({
  ...(await original<typeof import("vue")>()),
  onMounted: (callback: () => Promise<void>) => {
    harness.mount = callback;
  },
  onScopeDispose: (callback: () => void) => {
    harness.dispose = callback;
  }
}));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => harness.desktop }));
vi.mock("~/shared/desktop/bridge", () => ({
  desktopInvoke: (...args: unknown[]) => harness.invoke(...args),
  desktopListen: (...args: unknown[]) => harness.listen(...args)
}));

const snapshot = (site: string): LocalAgentsSnapshot => ({ enabled: true, site, profiles: [], sessions: [] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("local agent window state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.desktop = true;
    harness.mount = undefined;
    harness.dispose = undefined;
    harness.invoke.mockResolvedValue(snapshot("initial"));
    harness.listen.mockImplementation(async (_event, receive) => {
      harness.receive = receive;
      return harness.unlisten;
    });
  });

  it("does not access the desktop bridge in the web runtime", async () => {
    harness.desktop = false;
    const agents = useLocalAgents();
    await harness.mount!();
    await agents.refresh();
    expect(agents.enabled.value).toBe(false);
    expect(agents.loaded.value).toBe(true);
    expect(harness.listen).not.toHaveBeenCalled();
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it("keeps a live snapshot when an older initial read completes", async () => {
    const pending = deferred<LocalAgentsSnapshot>();
    harness.invoke.mockReturnValue(pending.promise);
    const agents = useLocalAgents();
    const mounting = harness.mount!();
    await Promise.resolve();
    harness.receive!({ payload: snapshot("live") });
    pending.resolve(snapshot("stale"));
    await mounting;
    expect(agents.site.value).toBe("live");
    harness.dispose!();
    expect(harness.unlisten).toHaveBeenCalledOnce();
    harness.receive!({ payload: snapshot("after-close") });
    expect(agents.site.value).toBe("live");
  });

  it("releases a subscription that finishes installing after the page is disposed", async () => {
    const pending = deferred<() => void>();
    harness.listen.mockReturnValue(pending.promise);
    useLocalAgents();
    const mounting = harness.mount!();
    harness.dispose!();
    pending.resolve(harness.unlisten);
    await mounting;
    expect(harness.unlisten).toHaveBeenCalledOnce();
    expect(harness.invoke).not.toHaveBeenCalled();
  });

  it("does not restore a previous account's snapshot after a newer refresh", async () => {
    const agents = useLocalAgents();
    await harness.mount!();
    const first = deferred<LocalAgentsSnapshot>();
    const second = deferred<LocalAgentsSnapshot>();
    harness.invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldRefresh = agents.refresh();
    const newRefresh = agents.refresh();
    second.resolve(snapshot("new-account"));
    await newRefresh;
    first.resolve(snapshot("old-account"));
    await oldRefresh;
    expect(agents.site.value).toBe("new-account");
  });
});
