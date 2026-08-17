export const warmupWebSettings = () => {
  void Promise.all([
    import("~/components/Settings/settingsPanel.vue"),
    import("~/pages/setting/general.vue"),
    import("~/pages/setting/appearance.vue"),
    import("~/pages/setting/about.vue")
  ]);
};

export const useSettingsWindow = () => {
  const route = useRoute();
  const localePath = useLocalePath();
  const returnPath = useState("settings-return-path", () => "/");

  const openSettings = async (path = "/setting/general") => {
    if (!route.path.startsWith("/setting/")) {
      returnPath.value = route.fullPath;
    }

    await navigateTo(localePath({ path }));
  };

  const closeSettings = async () => {
    const target = returnPath.value.startsWith("/setting/") ? "/" : returnPath.value;
    returnPath.value = "/";
    await navigateTo(target || "/");
  };

  return {
    openSettings,
    closeSettings,
    warmupWebSettings
  };
};
