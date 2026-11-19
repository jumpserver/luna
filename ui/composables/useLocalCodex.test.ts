import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, reactive, shallowRef } from "vue";
import { localCodexRevision, localCodexSettings, useLocalAiMessages, useLocalCodex } from "./useLocalCodex";
import { DEFAULT_CODEX_SETTINGS } from "~/shared/codex/types";
import { LocalAiError } from "~/shared/codex/errorProtocol";
import { localAiMessages } from "~/shared/codex/messages";
import { setWorkspaceAiEnabled, workspaceAiEnabled } from "~/shared/aiAvailability";
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
  setWorkspaceAiEnabled(false);
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  setWorkspaceAiEnabled(false);
});
it("localizes coded configuration errors and preserves installation and runtime-status failures", () => {
  const locale = shallowRef("zh");
  vi.stubGlobal("useI18n", () => ({ locale, t: (key: string) => key }));
  try {
    const { formatError } = useLocalAiMessages();
    for (const message of [
      "Error invoking remote method 'jms:invoke': Error: Codex download failed: HTTP 401",
      "Error invoking remote method 'jms:invoke': Error: Local AI requires a current login"
    ])
      expect(formatError(new Error(message))).toBe(message);
    const failure = new LocalAiError("LOCAL_AI_PROVIDER_ERROR", "Future provider wording", { status: 401 });
    expect(formatError(failure)).toBe(localAiMessages.zh.errors.authenticationFailed);
    locale.value = "en";
    expect(formatError(failure)).toBe(localAiMessages.en.errors.authenticationFailed);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("opening settings does not reset an already configured local runtime", async () => {
  setWorkspaceAiEnabled(true);
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
it("requires the enterprise AI switch without overwriting the saved local preference", async () => {
  mock.invoke.mockResolvedValue({ ...DEFAULT_CODEX_SETTINGS, enabled: true });
  const codex = open();
  await codex.refresh();
  expect(workspaceAiEnabled.value).toBe(false);
  setWorkspaceAiEnabled(true);
  expect(workspaceAiEnabled.value).toBe(true);
  setWorkspaceAiEnabled(false);
  expect(workspaceAiEnabled.value).toBe(false);
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
