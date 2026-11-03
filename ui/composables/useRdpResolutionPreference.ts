import type { RdpGraphics, ResolutionType } from "~/types";
import { getLunaPreferences, updateLunaPreferences } from "~/composables/useApiRequest";
import { useSettingManager } from "~/composables/useSettingManager";
import { resolveKeyboardLayout } from "~/lion/utils/keyboard";
import { useUserInfoStore } from "~/store/modules/userInfo";

type GraphicsFields = Pick<
  RdpGraphics,
  | "rdp_resolution"
  | "keyboard_layout"
  | "rdp_color_quality"
  | "rdp_smart_size"
  | "rdp_client_option"
  | "printers_redirect"
  | "rdp_keyboard_hook"
>;

function normalizeKeyboardHook(value: unknown): NonNullable<RdpGraphics["rdp_keyboard_hook"]> {
  return value === "0" || value === "1" ? value : "2";
}

export function useRdpResolutionPreference() {
  const user = useUserInfoStore();
  const {
    rdpResolution,
    keyboardLayout: localKeyboardLayout,
    rdpColorQuality,
    rdpSmartSize,
    rdpClientOption,
    setRdpResolutionPreference,
    setKeyboardLayoutPreference,
    setRdpColorQualityPreference,
    setRdpSmartSizePreference,
    setRdpClientOptionPreference
  } = useSettingManager();
  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const serverGraphics = shallowRef<GraphicsFields>({});
  const busy = shallowRef(false);
  const scope = computed(() =>
    user.loggedIn ? JSON.stringify([user.currentSite, user.currentAccountId, user.currentUser?.userId]) : ""
  );
  let generation = 0;

  const applyLocal = (partial: GraphicsFields) => {
    if (partial.rdp_resolution) setRdpResolutionPreference((partial.rdp_resolution || "auto") as ResolutionType);
    if (partial.keyboard_layout) setKeyboardLayoutPreference(partial.keyboard_layout);
    if (partial.rdp_color_quality) setRdpColorQualityPreference(partial.rdp_color_quality);
    if (partial.rdp_smart_size != null) setRdpSmartSizePreference(partial.rdp_smart_size);
    if (Array.isArray(partial.rdp_client_option)) setRdpClientOptionPreference(partial.rdp_client_option);
  };

  watch(
    scope,
    async (currentScope, _previous, onCleanup) => {
      const request = ++generation;
      serverGraphics.value = {};
      busy.value = Boolean(currentScope);
      if (!currentScope) return;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      try {
        const preferences = await getLunaPreferences();
        if (cancelled) return;
        const graphics: GraphicsFields = {
          rdp_resolution: preferences.graphics?.rdp_resolution,
          keyboard_layout: resolveKeyboardLayout(preferences.graphics?.keyboard_layout),
          rdp_color_quality: preferences.graphics?.rdp_color_quality || "32",
          rdp_smart_size: preferences.graphics?.rdp_smart_size || "0",
          printers_redirect: preferences.graphics?.printers_redirect ?? false,
          rdp_keyboard_hook: normalizeKeyboardHook(preferences.graphics?.rdp_keyboard_hook),
          rdp_client_option: Array.isArray(preferences.graphics?.rdp_client_option)
            ? [...preferences.graphics.rdp_client_option]
            : []
        };
        serverGraphics.value = graphics;
        applyLocal(graphics);
      } catch (error) {
        if (!cancelled) addErrorToast({ title: t("Common.OperationFailed"), error });
      } finally {
        if (!cancelled && request === generation) busy.value = false;
      }
    },
    { immediate: true, flush: "sync" }
  );

  async function patchGraphics(partial: GraphicsFields) {
    if (busy.value) return;
    if (!scope.value) {
      applyLocal(partial);
      serverGraphics.value = { ...serverGraphics.value, ...partial };
      return;
    }
    const request = generation;
    busy.value = true;
    try {
      await updateLunaPreferences({ graphics: partial });
      if (request !== generation) return;
      serverGraphics.value = { ...serverGraphics.value, ...partial };
      applyLocal(partial);
    } catch (error) {
      if (request === generation) addErrorToast({ title: t("Common.OperationFailed"), error });
    } finally {
      if (request === generation) busy.value = false;
    }
  }

  async function setResolution(value: ResolutionType) {
    await patchGraphics({ rdp_resolution: value || "auto" });
  }

  const clientOptions = () => {
    if (Array.isArray(serverGraphics.value.rdp_client_option)) return serverGraphics.value.rdp_client_option;
    if (Array.isArray(rdpClientOption.value)) return rdpClientOption.value;
    return [];
  };

  async function setClientOption(flag: string, enabled: boolean) {
    const current = clientOptions();
    const next = enabled ? [...new Set([...current, flag])] : current.filter((item) => item !== flag);
    await patchGraphics({ rdp_client_option: next });
  }

  const bindFlag = (flag: string) =>
    computed({
      get: () => clientOptions().includes(flag),
      set: (value: boolean) => {
        void setClientOption(flag, value);
      }
    });

  const resolution = computed<ResolutionType>({
    get: () => (serverGraphics.value.rdp_resolution || rdpResolution.value || "auto") as ResolutionType,
    set: (value) => {
      void setResolution(value || "auto");
    }
  });
  const colorQuality = computed({
    get: () => serverGraphics.value.rdp_color_quality || rdpColorQuality.value || "32",
    set: (value: string) => {
      void patchGraphics({ rdp_color_quality: value || "32" });
    }
  });
  const keyboardLayout = computed({
    get: () => resolveKeyboardLayout(serverGraphics.value.keyboard_layout || localKeyboardLayout.value),
    set: (value: string) => {
      void patchGraphics({ keyboard_layout: resolveKeyboardLayout(value) });
    }
  });
  const smartSize = computed({
    get: () => serverGraphics.value.rdp_smart_size || rdpSmartSize.value || "0",
    set: (value: string) => {
      void patchGraphics({ rdp_smart_size: value || "0" });
    }
  });
  const printersRedirect = computed({
    get: () => serverGraphics.value.printers_redirect ?? false,
    set: (value: boolean) => {
      void patchGraphics({ printers_redirect: value });
    }
  });
  const keyboardHook = computed({
    get: () => normalizeKeyboardHook(serverGraphics.value.rdp_keyboard_hook),
    set: (value: NonNullable<RdpGraphics["rdp_keyboard_hook"]>) => {
      void patchGraphics({ rdp_keyboard_hook: normalizeKeyboardHook(value) });
    }
  });

  return {
    resolution,
    keyboardLayout,
    busy,
    setResolution,
    colorQuality,
    smartSize,
    printersRedirect,
    keyboardHook,
    fullScreen: bindFlag("full_screen"),
    multiScreen: bindFlag("multi_screen"),
    drivesRedirect: bindFlag("drives_redirect")
  };
}
