import type { SettingsSection } from "~/components/Settings/settingsPanel.vue";

const open = ref(false);
const activeSection = ref<SettingsSection>("general");

export const warmupWebSettings = () => {
  if (isTauriRuntime()) return;

  void Promise.all([
    import("~/components/Settings/settingsPanel.vue"),
    import("~/pages/setting/general.vue"),
    import("~/pages/setting/appearance.vue"),
    import("~/pages/setting/about.vue")
  ]);
};

/** ponytail: warm settings chunks at boot so first open feels like Tolaria overlay */
export const preloadSettingsModal = () => {
  warmupWebSettings();
};

export const useSettingsWindow = () => {
  const openSettings = () => {
    activeSection.value = "general";
    open.value = true;
  };

  const closeSettings = () => {
    open.value = false;
  };

  return {
    open,
    activeSection,
    openSettings,
    closeSettings,
    warmupWebSettings,
    preloadSettingsModal
  };
};
