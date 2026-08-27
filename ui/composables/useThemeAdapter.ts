import type { Event } from "@tauri-apps/api/event";
import type { Theme } from "@tauri-apps/api/window";
import { nextTick } from "vue";
import { desktopWindow } from "~/shared/desktop/bridge";

export const useThemeAdapter = () => {
  const currentOSTheme = ref<Theme>("light");

  const uiColorMode = useColorMode();
  const {
    theme: userTheme,
    themeMode,
    followSystem,
    hydrationPromise,
    isHydrated,
    setTheme,
    setThemeMode,
    setFollowSystem
  } = useSettingManager();

  const getSystemTheme = async (): Promise<Theme> => {
    if (!isDesktopRuntime()) {
      return globalThis.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    }

    return (await desktopWindow.theme()) || "light";
  };

  const waitHydration = async () => {
    if (isHydrated.value) return;

    // 等待 useSettingManager 完成初始化
    if (!hydrationPromise.value) {
      await nextTick();
    }

    const promise = hydrationPromise.value;

    if (promise) {
      try {
        await promise;
      } catch (err) {
        console.error("wait hydration failed", err);
      }
    }
  };

  /**
   * @description 应用首次加载默认使用 OS Theme
   */
  const initialTheme = async () => {
    await waitHydration();

    const savedMode = (themeMode.value || "") as string;
    const modeIsWithSystem = savedMode === "withSystem";
    const modeIsManual = savedMode === "dark" || savedMode === "light";

    const follow = modeIsWithSystem ? true : modeIsManual ? false : followSystem.value;
    const savedTheme = (modeIsManual ? savedMode : userTheme.value) as Theme | "";

    const osTheme = await getSystemTheme();

    if (!osTheme) {
      if (savedTheme) {
        uiColorMode.preference = savedTheme;
      }
      return;
    }

    currentOSTheme.value = osTheme;

    if (follow) {
      if (themeMode.value !== "withSystem") {
        setThemeMode("withSystem");
      }
      if (!followSystem.value) {
        setFollowSystem(true);
      }
      uiColorMode.preference = osTheme;
      setTheme(osTheme);
      return;
    }

    if (followSystem.value) {
      setFollowSystem(false);
    }

    if (savedTheme) {
      uiColorMode.preference = savedTheme;
      return;
    }

    uiColorMode.preference = osTheme;
    setTheme(osTheme);
  };

  const manualSetTheme = (theme: Theme) => {
    setFollowSystem(false);
    setThemeMode(theme as any);
    uiColorMode.preference = theme;
    setTheme(theme);
  };

  const enableFollowSystem = async () => {
    setFollowSystem(true);
    setThemeMode("withSystem");

    const osTheme = (await getSystemTheme()) || currentOSTheme.value;

    if (osTheme) {
      currentOSTheme.value = osTheme;
      uiColorMode.preference = osTheme;
      setTheme(osTheme);
    }
  };

  const applyThemePreference = (theme: Theme) => {
    uiColorMode.preference = theme;
  };

  const applySystemThemePreference = async () => {
    const osTheme = (await getSystemTheme()) || currentOSTheme.value;

    if (osTheme) {
      currentOSTheme.value = osTheme;
      uiColorMode.preference = osTheme;
    }
  };

  const listenOSThemeChange = () => {
    if (!isDesktopRuntime()) {
      const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
      if (!media) return;

      media.addEventListener("change", (event) => {
        const nextTheme: Theme = event.matches ? "dark" : "light";
        currentOSTheme.value = nextTheme;

        if (themeMode.value === "withSystem" || followSystem.value) {
          uiColorMode.preference = nextTheme;
          setTheme(nextTheme);
        }
      });
      return;
    }

    // 监听 OS 主题变化
    desktopWindow.onThemeChanged((event: Event<Theme>) => {
      currentOSTheme.value = event.payload;

      if (themeMode.value === "withSystem" || followSystem.value) {
        uiColorMode.preference = event.payload;
        setTheme(event.payload);
      }
    });
  };

  return {
    userTheme,
    themeMode,
    followSystem,

    initialTheme,
    manualSetTheme,
    enableFollowSystem,
    listenOSThemeChange,
    applyThemePreference,
    applySystemThemePreference
  };
};
