import type { Event } from "@tauri-apps/api/event";
import type { Theme } from "@tauri-apps/api/window";
import { useUserSettingStore } from "~/store/modules/userSetting";

export const useThemeAdapter = () => {
  const currentOSTheme = ref<Theme>("light");

  const uiColorMode = useColorMode();
  const userSettingStore = useUserSettingStore();
  const currentWindow = useTauriWindowGetCurrentWindow();

  const { setTheme, setFollowSystem } = userSettingStore;
  const { theme: userTheme, followSystem } = storeToRefs(userSettingStore);

  /**
   * @description 应用首次加载默认使用 OS Theme
   */
  const initialTheme = async () => {
    const osTheme = await currentWindow.theme();
    
    if (!osTheme) return;

    currentOSTheme.value = osTheme;

    if (followSystem.value || !userTheme.value) {
      uiColorMode.preference = osTheme;
      setTheme(osTheme);
    } else {
      uiColorMode.preference = userTheme.value as Theme;
    }
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

  onMounted(() => {
    initialTheme();
    listenOSThemeChange();
  });

  return {
    userTheme,
    followSystem,
    currentOSTheme,

    manualSetTheme,
    enableFollowSystem
  };
};
