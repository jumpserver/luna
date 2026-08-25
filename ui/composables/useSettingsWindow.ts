export type SettingsSection = "user" | "general" | "appearance" | "application" | "about";

export const useSettingsWindow = () => {
  const route = useRoute();
  const open = useState("settings-open", () => false);
  const activeSection = useState<SettingsSection>("settings-active-section", () => "general");
  const activeApplicationProtocol = useState("settings-active-application-protocol", () => "ssh");

  const openSettings = async (path = "/setting/general") => {
    const [, section, protocol] =
      path.match(/^\/setting\/(user|general|appearance|application|about)(?:\/([^/?#]+))?/) || [];

    if (section) {
      activeSection.value = section as SettingsSection;
    }
    if (section === "application" && protocol) {
      activeApplicationProtocol.value = decodeURIComponent(protocol);
    }

    open.value = true;
  };

  const closeSettings = async () => {
    if (open.value) {
      open.value = false;
      return;
    }

    if (route.path.startsWith("/setting/")) {
      await navigateTo("/");
    }
  };

  return {
    open,
    activeSection,
    activeApplicationProtocol,
    openSettings,
    closeSettings
  };
};
