import type { ResolutionType } from "~/types";
import { getLunaPreferences, updateLunaPreferences } from "~/composables/useApiRequest";
import { useSettingManager } from "~/composables/useSettingManager";
import { useUserInfoStore } from "~/store/modules/userInfo";

export function useRdpResolutionPreference() {
  const user = useUserInfoStore();
  const { rdpResolution, setRdpResolutionPreference } = useSettingManager();
  const { t } = useI18n();
  const { addErrorToast } = useErrorToast();
  const serverResolution = shallowRef<string>();
  const busy = shallowRef(false);
  const scope = computed(() =>
    user.loggedIn ? JSON.stringify([user.currentSite, user.currentAccountId, user.currentUser?.userId]) : ""
  );
  let generation = 0;

  watch(
    scope,
    async (currentScope, _previous, onCleanup) => {
      const request = ++generation;
      serverResolution.value = undefined;
      busy.value = !!currentScope;
      if (!currentScope) return;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      try {
        const preferences = await getLunaPreferences();
        if (!cancelled) serverResolution.value = preferences.graphics?.rdp_resolution;
      } catch (error) {
        if (!cancelled) addErrorToast({ title: t("Common.OperationFailed"), error });
      } finally {
        if (!cancelled && request === generation) busy.value = false;
      }
    },
    { immediate: true, flush: "sync" }
  );

  async function setResolution(value: ResolutionType) {
    if (busy.value) return;
    if (!scope.value) {
      setRdpResolutionPreference(value);
      return;
    }
    const request = generation;
    busy.value = true;
    try {
      await updateLunaPreferences({ graphics: { rdp_resolution: value } });
      if (request !== generation) return;
      serverResolution.value = value;
      setRdpResolutionPreference(value);
    } catch (error) {
      if (request === generation) addErrorToast({ title: t("Common.OperationFailed"), error });
    } finally {
      if (request === generation) busy.value = false;
    }
  }

  const resolution = computed<ResolutionType>({
    get: () => (serverResolution.value || rdpResolution.value || "auto") as ResolutionType,
    set: (value) => {
      void setResolution(value || "auto");
    }
  });
  return { resolution, busy, setResolution };
}
