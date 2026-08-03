export const useToolWindow = () => {
  const { isMacOS } = usePlatform();
  const { userTheme } = useThemeAdapter();
  const { lightThemePreset, darkThemePreset, primaryColorLight, primaryColorDark } = useSettingManager();

  const withEmbeddedQuery = (path: string) => {
    const mode = userTheme.value === "dark" ? "dark" : "light";
    const themePreset = mode === "dark" ? darkThemePreset.value : lightThemePreset.value;
    const accent = mode === "dark" ? primaryColorDark.value : primaryColorLight.value;
    const divider = path.includes("?") ? "&" : "?";
    const query = new URLSearchParams({
      embedded: "1",
      tool_window: "1",
      theme: mode
    });

    if (themePreset) {
      query.set("themePreset", themePreset);
    }

    if (accent) {
      query.set("accent", accent);
    }

    return `${path}${divider}${query.toString()}`;
  };

  const resolveWindowLabel = (path: string) => {
    if (path.includes("/videoplayer")) {
      return "videoplayer";
    }

    if (path.includes("/transcode")) {
      return "transcode";
    }

    return "secondary";
  };

  const openToolWindow = async (path: string, title: string) => {
    const url = withEmbeddedQuery(path);
    const label = resolveWindowLabel(path);
    const theme = userTheme.value === "dark" ? "dark" : "light";

    if (!isTauriRuntime()) {
      window.open(url, "_blank", "noopener");
      return;
    }

    const existing = await useTauriWebviewWindowWebviewWindow.getByLabel(label);
    if (existing) {
      await existing.unminimize();
      await existing.show();
      await existing.setFocus();
      return existing;
    }

    return new useTauriWebviewWindowWebviewWindow(label, {
      url,
      title: isMacOS.value ? title : "",
      width: 1180,
      height: 760,
      minWidth: 960,
      minHeight: 640,
      center: true,
      theme,
      decorations: isMacOS.value,
      shadow: false,
      titleBarStyle: isMacOS.value ? "overlay" : undefined,
      hiddenTitle: isMacOS.value
    });
  };

  return {
    openToolWindow
  };
};
