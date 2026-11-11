import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, reactive, shallowRef } from "vue";
import { localCodexRevision, localCodexSettings, useLocalCodex } from "./useLocalCodex";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
import { setLocalCodexEnabled, setWorkspaceAiEnabled, workspaceAiEnabled } from "~/shared/aiAvailability";
const mock = vi.hoisted(() => ({ invoke: vi.fn(), desktop: true, store: {} as any }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: mock.invoke, desktopListen: async () => () => {} }));
vi.mock("~/utils/runtime", () => ({ isDesktopRuntime: () => mock.desktop }));
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => mock.store }));
let sequence = 0;
const scopes: ReturnType<typeof effectScope>[] = [];
const open = () => {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useLocalCodex(shallowRef(true)))!;
};
beforeEach(() => {
  mock.invoke.mockReset();
  mock.desktop = true;
  mock.store = reactive({ loggedIn: true, currentSite: `site-${++sequence}`, currentAccountId: "user-a" });
  localCodexSettings.value = { ...DEFAULT_CODEX_SETTINGS };
  setLocalCodexEnabled(false);
  setWorkspaceAiEnabled(false);
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  setLocalCodexEnabled(false);
});
it("opening settings does not reset an already configured local runtime", async () => {
  mock.invoke.mockResolvedValue({ ...DEFAULT_CODEX_SETTINGS, enabled: true });
  const main = open();
  await main.refresh();
  expect(workspaceAiEnabled.value).toBe(true);
  const revision = localCodexRevision.value;
  const settings = open();
  await settings.refresh();
  expect(localCodexRevision.value).toBe(revision);
  expect(localCodexSettings.value.enabled).toBe(true);
});
it("ignores configuration returned for a logged-out account", async () => {
  const pending = Promise.withResolvers<any>();
  mock.invoke.mockReturnValue(pending.promise);
  const codex = open();
  const request = codex.refresh();
  mock.store.loggedIn = false;
  pending.resolve({ ...DEFAULT_CODEX_SETTINGS, enabled: true });
  await request;
  expect(localCodexSettings.value.enabled).toBe(false);
  expect(workspaceAiEnabled.value).toBe(false);
});
it("ignores a save result from a previous account and never invokes native APIs on Web", async () => {
  mock.invoke.mockResolvedValueOnce({ ...DEFAULT_CODEX_SETTINGS });
  const codex = open();
  await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalled());
  const pending = Promise.withResolvers<any>();
  mock.invoke.mockReturnValue(pending.promise);
  const saving = codex.save({ ...DEFAULT_CODEX_SETTINGS, enabled: true });
  mock.store.currentAccountId = "user-b";
  pending.resolve({ ...DEFAULT_CODEX_SETTINGS, enabled: false });
  await saving;
  expect(localCodexSettings.value.enabled).toBe(false);
  mock.desktop = false;
  mock.invoke.mockClear();
  open();
  expect(mock.invoke).not.toHaveBeenCalled();
});
