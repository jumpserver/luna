import type { RdpGraphics, ResolutionType } from "~/types";
import { getLunaPreferences, updateLunaPreferences } from "~/composables/useApiRequest";
import { useSettingManager } from "~/composables/useSettingManager";
import { useUserInfoStore } from "~/store/modules/userInfo";

type GraphicsFields = Pick<
  RdpGraphics,
  "rdp_resolution" | "rdp_color_quality" | "rdp_smart_size" | "rdp_client_option"
>;

export function useRdpResolutionPreference() {
  const user = useUserInfoStore();
  const {
    rdpResolution,
    rdpColorQuality,
    rdpSmartSize,
    rdpClientOption,
    setRdpResolutionPreference,
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
          rdp_color_quality: preferences.graphics?.rdp_color_quality || "32",
          rdp_smart_size: preferences.graphics?.rdp_smart_size || "0",
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
  const smartSize = computed({
    get: () => serverGraphics.value.rdp_smart_size || rdpSmartSize.value || "0",
    set: (value: string) => {
      void patchGraphics({ rdp_smart_size: value || "0" });
    }
  });

  return {
    resolution,
    busy,
    setResolution,
    colorQuality,
    smartSize,
    fullScreen: bindFlag("full_screen"),
    multiScreen: bindFlag("multi_screen"),
    drivesRedirect: bindFlag("drives_redirect")
  };
}
