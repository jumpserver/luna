import type { EffectScope } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, reactive, ref } from "vue";
import { useRdpResolutionPreference } from "./useRdpResolutionPreference";

const api = vi.hoisted(() => ({ getLunaPreferences: vi.fn(), updateLunaPreferences: vi.fn() }));
vi.mock("~/composables/useApiRequest", () => api);
const user = reactive({ loggedIn: true, currentSite: "site", currentAccountId: "user" });
const local = ref("1920x1080");
const colorLocal = ref("32");
const smartLocal = ref("0");
const clientLocal = ref<string[]>([]);
const persist = vi.fn((value: string) => {
  local.value = value;
});
const persistColor = vi.fn((value: string) => {
  colorLocal.value = value;
});
const persistSmart = vi.fn((value: string) => {
  smartLocal.value = value;
});
const persistClient = vi.fn((value: string[]) => {
  clientLocal.value = value;
});
const errorToast = vi.fn();
vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => user }));
vi.mock("~/composables/useSettingManager", () => ({
  useSettingManager: () => ({
    rdpResolution: local,
    rdpColorQuality: colorLocal,
    rdpSmartSize: smartLocal,
    rdpClientOption: clientLocal,
    setRdpResolutionPreference: persist,
    setRdpColorQualityPreference: persistColor,
    setRdpSmartSizePreference: persistSmart,
    setRdpClientOptionPreference: persistClient
  })
}));
let scope: EffectScope;
const start = () => scope.run(() => useRdpResolutionPreference())!;

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(user, { loggedIn: true, currentSite: "site", currentAccountId: "user" });
  local.value = "1920x1080";
  colorLocal.value = "32";
  smartLocal.value = "0";
  clientLocal.value = [];
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
    persist.mockClear();
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
  persist.mockClear();
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
});

it("retains the local default when no account is logged in", async () => {
  user.loggedIn = false;
  const preference = start();
  await preference.setResolution("1366x768");
  expect(preference.resolution.value).toBe("1366x768");
  expect(api.getLunaPreferences).not.toHaveBeenCalled();
  expect(api.updateLunaPreferences).not.toHaveBeenCalled();
});

it("resets omitted color and smart-size prefs when the account changes", async () => {
  api.getLunaPreferences.mockResolvedValue({
    graphics: { rdp_resolution: "1600x900", rdp_color_quality: "8", rdp_smart_size: "1" }
  });
  const preference = start();
  await vi.waitFor(() => expect(preference.busy.value).toBe(false));
  expect(preference.colorQuality.value).toBe("8");
  expect(preference.smartSize.value).toBe("1");
  persistColor.mockClear();
  persistSmart.mockClear();
  api.getLunaPreferences.mockResolvedValue({ graphics: { rdp_resolution: "auto" } });
  user.currentAccountId = "another-user";
  await vi.waitFor(() => expect(preference.busy.value).toBe(false));
  expect(preference.colorQuality.value).toBe("32");
  expect(preference.smartSize.value).toBe("0");
  expect(persistColor).toHaveBeenCalledWith("32");
  expect(persistSmart).toHaveBeenCalledWith("0");
});

it("toggles drive redirect without dropping other RDP client options", async () => {
  api.getLunaPreferences.mockResolvedValue({
    graphics: {
      rdp_resolution: "auto",
      rdp_client_option: ["remote_microphone", "full_screen"]
    }
  });
  const preference = start();
  await vi.waitFor(() => expect(preference.busy.value).toBe(false));
  expect(preference.fullScreen.value).toBe(true);
  expect(preference.drivesRedirect.value).toBe(false);
  preference.drivesRedirect.value = true;
  await vi.waitFor(() =>
    expect(api.updateLunaPreferences).toHaveBeenCalledWith({
      graphics: { rdp_client_option: ["remote_microphone", "full_screen", "drives_redirect"] }
    })
  );
  expect(clientLocal.value).toEqual(["remote_microphone", "full_screen", "drives_redirect"]);
});
