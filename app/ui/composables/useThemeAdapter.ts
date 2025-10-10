import type { Event } from '@tauri-apps/api/event';
import type { Theme } from '@tauri-apps/api/window';
import { useUserSettingStore } from '~/store/modules/userSetting';

export const useThemeAdapter = () => {
  const currentOSTheme = ref<Theme>('light');

  const uiColorMode = useColorMode();
  const userSettingStore = useUserSettingStore();
  const currentWindow = useTauriWindowGetCurrentWindow();

  const { setTheme } = userSettingStore;
  const { theme: userTheme } = storeToRefs(userSettingStore);

  /**
   * @description 应用首次加载默认使用 OS Theme
   */
  const initialTheme = async () => {
    if (userTheme.value) {
      return;
    }

    const theme = await currentWindow.theme();

    if (!theme) return;

    setTheme(theme);
    currentOSTheme.value = theme;
    uiColorMode.preference = theme;
  };

  const manualSetTheme = (theme: Theme) => {
    uiColorMode.preference = theme;
    setTheme(theme);
  };

  const listenOSThemeChange = () => {
    // 监听 OS 主题变化
    currentWindow.onThemeChanged((event: Event<Theme>) => {
      currentOSTheme.value = event.payload;
      uiColorMode.preference = event.payload;
      setTheme(event.payload);
    });
  };

  onMounted(() => {
    initialTheme();
    listenOSThemeChange();
  });

  return {
    userTheme,
    currentOSTheme,

    manualSetTheme,
  };
};
