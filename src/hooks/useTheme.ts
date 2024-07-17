import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { Theme } from '@/styles/types';
import { DEFAULT_PRIMARY } from '@/config';
import { createDiscreteApi } from 'naive-ui';
import { asideTheme } from '@/styles/theme/aside.ts';
import { getLightColor, getDarkColor } from '@/utils';
import { initialThemeOverrides } from '@/ThemeOverrides.ts';
import { useGlobalStore } from '@/stores/modules/global.ts';
import { mainContentTheme } from '@/styles/theme/mainContent.ts';

/**
 * @description 全局主题 hooks
 * */

export const useTheme = () => {
  const globalStore = useGlobalStore();

  const { t } = useI18n();
  const { message } = createDiscreteApi(['message']);
  const { isDark, primary } = storeToRefs(globalStore);

  /**
   * @description 切换黑暗模式 同时修改主题颜色
   */
  const switchDark = (): void => {
    const html: HTMLElement = document.documentElement;

    if (isDark.value) {
      html.setAttribute('class', 'dark');
    } else {
      html.setAttribute('class', '');
    }

    changePrimary(primary.value);
    setMainTheme();
    setAsideTheme();
  };

  const getCssVariableValue = (variableName: string) => {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  };
  console.log(getCssVariableValue);
  const lightOverrides = () => {
    const lightOverrides = initialThemeOverrides();
    console.log(lightOverrides);
    // lightOverrides.common?.primaryColor = getCssVariableValue('--el-color-primary');
    // lightOverrides.common?.primaryColorHover = getCssVariableValue('--el-color-primary-hover');
    // lightOverrides.common?.primaryColorPressed = getCssVariableValue('--el-color-primary-pressed');
    // lightOverrides.common?.primaryColorSuppl = getCssVariableValue('--el-color-primary-suppl');
  };
  const darkOverrides = () => {
    const darkOverrides = initialThemeOverrides();
    console.log(darkOverrides);
  };

  /**
   * 组件颜色重写
   * @param isDark
   */
  const initThemeColor = (isDark: boolean) => {
    isDark ? darkOverrides() : lightOverrides();
  };

  /**
   * @description 切换主题颜色
   */
  const changePrimary = (val: string | null) => {
    if (!val) {
      val = DEFAULT_PRIMARY;
      message.success(`${t('Theme Reset')} ${DEFAULT_PRIMARY}`);
    }

    // 计算主题颜色变化
    document.documentElement.style.setProperty('--el-color-primary', val);
    document.documentElement.style.setProperty(
      '--el-color-primary-dark-2',
      isDark.value ? `${getLightColor(val, 0.2)}` : `${getDarkColor(val, 0.3)}`
    );

    for (let i = 1; i <= 9; i++) {
      const primaryColor = isDark.value
        ? `${getDarkColor(val, i / 10)}`
        : `${getLightColor(val, i / 10)}`;
      document.documentElement.style.setProperty(`--el-color-primary-light-${i}`, primaryColor);
    }

    initThemeColor(isDark.value as boolean);
    globalStore.setGlobalState('primary', val);
  };

  /**
   * @description 设置侧边样式
   */
  const setAsideTheme = () => {
    let type: Theme.ThemeType = 'light';

    if (isDark.value) type = 'dark';

    const theme = asideTheme[type!];
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };

  /**
   * @description 设置主题样式
   */
  const setMainTheme = () => {
    let type: Theme.ThemeType = 'light';

    if (isDark.value) type = 'dark';

    const theme = mainContentTheme[type!];
    for (const [key, value] of Object.entries(theme)) {
      document.documentElement.style.setProperty(key, value);
    }
  };

  /**
   * 初始化样式
   */
  const initTheme = () => {
    switchDark();
  };

  return {
    initTheme,
    switchDark,
    setAsideTheme,
    changePrimary
  };
};
