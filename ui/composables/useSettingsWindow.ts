export type SettingsSection = "user" | "general" | "security" | "appearance" | "shortcuts" | "application" | "about";

export const useSettingsWindow = () => {
  const route = useRoute();
  const open = useState("settings-open", () => false);
  const activeSection = useState<SettingsSection>("settings-active-section", () => "general");
  const activeApplicationProtocol = useState("settings-active-application-protocol", () => "ssh");
  const activeApplicationView = useState<"applications" | "protocols">(
    "settings-active-application-view",
    () => "protocols"
  );
  const activeApplicationId = useState("settings-active-application-id", () => "");

  const openSettings = async (path = "/setting/general") => {
    const [, section, protocol] =
      path.match(/^\/setting\/(user|general|security|appearance|shortcuts|application|about)(?:\/([^/?#]+))?/) || [];

    if (section) {
      activeSection.value = section as SettingsSection;
    }
    if (section === "application" && protocol) {
      activeApplicationProtocol.value = decodeURIComponent(protocol);
      activeApplicationView.value = "protocols";
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
    activeApplicationView,
    activeApplicationId,
    openSettings,
    closeSettings
  };
};
