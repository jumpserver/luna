import { nextTick } from "vue";
import type { Event } from "@tauri-apps/api/event";
import type { Theme } from "@tauri-apps/api/window";

export const useThemeAdapter = () => {
  const currentOSTheme = ref<Theme>("light");

  const uiColorMode = useColorMode();
  const {
    theme: userTheme,
    followSystem,
    hydrationPromise,
    isHydrated,
    setTheme,
    setFollowSystem
  } = useSettingManager();

  const currentWindow = useTauriWindowGetCurrentWindow();

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

    const savedTheme = userTheme.value as Theme | "";
    const follow = followSystem.value;

    const osTheme = await currentWindow.theme();

    if (!osTheme) {
      if (savedTheme) {
        uiColorMode.preference = savedTheme;
      }
      return;
    }

    currentOSTheme.value = osTheme;

    if (follow) {
      uiColorMode.preference = osTheme;
      setTheme(osTheme);
      return;
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
    uiColorMode.preference = theme;
    setTheme(theme);
  };

  const enableFollowSystem = async () => {
    setFollowSystem(true);

    const osTheme = (await currentWindow.theme()) || currentOSTheme.value;

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
    const osTheme = (await currentWindow.theme()) || currentOSTheme.value;

    if (osTheme) {
      currentOSTheme.value = osTheme;
      uiColorMode.preference = osTheme;
    }
  };

  const listenOSThemeChange = () => {
    // 监听 OS 主题变化
    currentWindow.onThemeChanged((event: Event<Theme>) => {
      currentOSTheme.value = event.payload;

      if (followSystem.value) {
        uiColorMode.preference = event.payload;
        setTheme(event.payload);
      }
    });
  };

  return {
    userTheme,
    followSystem,

    initialTheme,
    manualSetTheme,
    enableFollowSystem,
    listenOSThemeChange,
    applyThemePreference,
    applySystemThemePreference
  };
};
