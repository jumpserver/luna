import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { Theme } from '@/styles/types';
import { DEFAULT_PRIMARY } from '@/config';
import { createDiscreteApi } from 'naive-ui';
import { asideTheme } from '@/styles/theme/aside.ts';
import { getLightColor, getDarkColor } from '@/utils';
import { useGlobalStore } from '@/stores/modules/global.ts';

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
    setAsideTheme();
  };

  /**
   * @description 切换主题颜色
   */
  const changePrimary = (val: string | null) => {
    if (!val) {
      val = DEFAULT_PRIMARY;
      message.success(`${t('Theme reset')} ${DEFAULT_PRIMARY}`);
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
