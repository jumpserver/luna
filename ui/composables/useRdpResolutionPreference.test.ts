import type { EffectScope } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, reactive, ref } from "vue";
import { useRdpResolutionPreference } from "./useRdpResolutionPreference";

const api = vi.hoisted(() => ({ getLunaPreferences: vi.fn(), updateLunaPreferences: vi.fn() }));
vi.mock("~/composables/useApiRequest", () => api);
const user = reactive({ loggedIn: true, currentSite: "site", currentAccountId: "user" });
const local = ref("1920x1080");
const persist = vi.fn((value: string) => {
  local.value = value;
});
const errorToast = vi.fn();
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => user }));
vi.mock("~/composables/useSettingManager", () => ({
  useSettingManager: () => ({ rdpResolution: local, setRdpResolutionPreference: persist })
}));
let scope: EffectScope;
const start = () => scope.run(() => useRdpResolutionPreference())!;

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(user, { loggedIn: true, currentSite: "site", currentAccountId: "user" });
  local.value = "1920x1080";
  api.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: "1600x900" } });
  api.updateLunaPreferences.mockResolvedValue({});
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useErrorToast", () => ({ addErrorToast: errorToast }));
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
});

it.each(["1024x768", "auto"] as const)(
  "loads the server preference and saves %s to the same preference",
  async (value) => {
    const preference = start();
    await vi.waitFor(() => expect(preference.busy.value).toBe(false));
    expect(preference.resolution.value).toBe("1600x900");
    let finish!: () => void;
    api.updateLunaPreferences.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const saving = preference.setResolution(value);
    expect(preference.busy.value).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    finish();
    await saving;
    expect(api.updateLunaPreferences).toHaveBeenCalledExactlyOnceWith({ graphics: { rdp_resolution: value } });
    expect(preference.resolution.value).toBe(value);
    expect(local.value).toBe(value);
  }
);

it("keeps the last saved value and reports a failed save", async () => {
  const preference = start();
  await vi.waitFor(() => expect(preference.busy.value).toBe(false));
  const error = new Error("Save failed");
  api.updateLunaPreferences.mockRejectedValue(error);
  await preference.setResolution("1024x768");
  expect(preference.resolution.value).toBe("1600x900");
  expect(persist).not.toHaveBeenCalled();
  expect(errorToast).toHaveBeenCalledWith(expect.objectContaining({ error }));
});

it.each(["load", "save"])("ignores an old %s response after the account changes", async (operation) => {
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  if (operation === "load") api.getLunaPreferences.mockReturnValueOnce(pending);
  const preference = start();
  let saving: Promise<void> | undefined;
  if (operation === "save") {
    await vi.waitFor(() => expect(preference.busy.value).toBe(false));
    api.updateLunaPreferences.mockReturnValueOnce(pending);
    saving = preference.setResolution("1024x768");
  }
  api.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: "auto" } });
  user.currentAccountId = "another-user";
  await vi.waitFor(() => expect(preference.busy.value).toBe(false));
  finish({ graphics: { rdp_resolution: "1024x768" } });
  await pending;
  await saving;
  expect(preference.resolution.value).toBe("auto");
  expect(persist).not.toHaveBeenCalled();
});

it("retains the local default when no account is logged in", async () => {
  user.loggedIn = false;
  const preference = start();
  await preference.setResolution("1366x768");
  expect(preference.resolution.value).toBe("1366x768");
  expect(api.getLunaPreferences).not.toHaveBeenCalled();
  expect(api.updateLunaPreferences).not.toHaveBeenCalled();
});
