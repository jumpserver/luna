import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { Theme } from '@/styles/types';
import { DEFAULT_PRIMARY } from '@/config';
import { createDiscreteApi, GlobalThemeOverrides } from 'naive-ui';
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

  /**
   * @description 获取 HTML 标签中设定的色值
   * @param {string} variableName
   */
  const getCssVariableValue = (variableName: string) => {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  };

  /**
   * @description 亮色主题下颜色的重设
   */
  const lightOverrides = () => {
    const lightOverrides: GlobalThemeOverrides = initialThemeOverrides();

    // Spin 相关
    (lightOverrides.Spin as NonNullable<GlobalThemeOverrides['Spin']>).color = getCssVariableValue(
      '--el-color-primary-light-1'
    );
    (lightOverrides.Spin as NonNullable<GlobalThemeOverrides['Spin']>).textColor =
      getCssVariableValue('--el-main-text-color');

    // List 相关
    (lightOverrides.List as NonNullable<GlobalThemeOverrides['List']>).fontSize = '14px';
    (lightOverrides.List as NonNullable<GlobalThemeOverrides['List']>).color =
      getCssVariableValue('--el-main-bg-color');
    (lightOverrides.List as NonNullable<GlobalThemeOverrides['List']>).textColor =
      getCssVariableValue('--el-aside-text-color');

    // Tag 相关
    (lightOverrides.Tag as NonNullable<GlobalThemeOverrides['Tag']>).textColor =
      getCssVariableValue('--el-color-primary-light-1');
    (lightOverrides.Tag as NonNullable<GlobalThemeOverrides['Tag']>).colorBordered =
      getCssVariableValue('--el-color-primary-light-9');

    // Switch 相关
    (lightOverrides.Switch as NonNullable<GlobalThemeOverrides['Switch']>).railColorActive =
      getCssVariableValue('--el-color-primary-light-1');
    (lightOverrides.Switch as NonNullable<GlobalThemeOverrides['Switch']>).boxShadowFocus =
      getCssVariableValue('--el-color-primary-light-5');

    // Dropdown 相关
    (lightOverrides.Dropdown as NonNullable<GlobalThemeOverrides['Dropdown']>).optionColorHover =
      getCssVariableValue('--el-color-primary-light-2');
    (
      lightOverrides.Dropdown as NonNullable<GlobalThemeOverrides['Dropdown']>
    ).optionTextColorHover = '#fff';

    // Select 相关
    (
      lightOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderFocus = getCssVariableValue('--el-color-primary-light-6');
    (
      lightOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderActive = getCssVariableValue('--el-color-primary-light-6');
    (
      lightOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderHover = getCssVariableValue('--el-color-primary-light-6');
    (
      lightOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).boxShadowFocus = getCssVariableValue('--el-color-primary-light-6');
    (
      lightOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).boxShadowActive = getCssVariableValue('--el-color-primary-light-6');

    (
      lightOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionCheckColor = '#fff';
    (
      lightOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionTextColorActive = '#fff';
    (
      lightOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionColorActive = getCssVariableValue('--el-color-primary-light-2');
    (
      lightOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionColorActivePending = getCssVariableValue('--el-color-primary-light-2');

    return lightOverrides;
  };

  /**
   * @description 暗色主题下颜色的重设
   */
  const darkOverrides = () => {
    const darkOverrides: GlobalThemeOverrides = initialThemeOverrides();

    (darkOverrides.Spin as NonNullable<GlobalThemeOverrides['Spin']>).color = getCssVariableValue(
      '--el-color-primary-light-1'
    );
    (darkOverrides.Spin as NonNullable<GlobalThemeOverrides['Spin']>).textColor =
      getCssVariableValue('--el-main-text-color');

    // List 相关
    (darkOverrides.List as NonNullable<GlobalThemeOverrides['List']>).fontSize = '14px';
    (darkOverrides.List as NonNullable<GlobalThemeOverrides['List']>).color =
      getCssVariableValue('--el-main-bg-color');
    (darkOverrides.List as NonNullable<GlobalThemeOverrides['List']>).textColor =
      getCssVariableValue('--el-aside-text-color');

    // Tag 相关
    (darkOverrides.Tag as NonNullable<GlobalThemeOverrides['Tag']>).textColor = getCssVariableValue(
      '--el-color-primary-light-1'
    );
    (darkOverrides.Tag as NonNullable<GlobalThemeOverrides['Tag']>).colorBordered =
      getCssVariableValue('--el-color-primary-light-9');

    // Switch 相关
    (darkOverrides.Switch as NonNullable<GlobalThemeOverrides['Switch']>).railColorActive =
      getCssVariableValue('--el-color-primary-light-1');
    (darkOverrides.Switch as NonNullable<GlobalThemeOverrides['Switch']>).boxShadowFocus =
      getCssVariableValue('--el-color-primary-light-5');

    // Dropdown 相关
    (darkOverrides.Dropdown as NonNullable<GlobalThemeOverrides['Dropdown']>).optionColorHover =
      getCssVariableValue('--el-color-primary-light-2');
    (darkOverrides.Dropdown as NonNullable<GlobalThemeOverrides['Dropdown']>).optionTextColorHover =
      '#fff';

    // Select 相关
    (
      darkOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderFocus = getCssVariableValue('--el-color-primary-light-6');
    (
      darkOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderActive = getCssVariableValue('--el-color-primary-light-6');
    (
      darkOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).borderHover = getCssVariableValue('--el-color-primary-light-6');
    (
      darkOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).boxShadowFocus = getCssVariableValue('--el-color-primary-light-6');
    (
      darkOverrides.InternalSelection as NonNullable<GlobalThemeOverrides['InternalSelection']>
    ).boxShadowActive = getCssVariableValue('--el-color-primary-light-6');

    (
      darkOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionCheckColor = '#fff';
    (
      darkOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionTextColorActive = '#fff';
    (
      darkOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionColorActive = getCssVariableValue('--el-color-primary-light-2');
    (
      darkOverrides.InternalSelectMenu as NonNullable<GlobalThemeOverrides['InternalSelectMenu']>
    ).optionColorActivePending = getCssVariableValue('--el-color-primary-light-2');

    return darkOverrides;
  };

  /**
   * @description 组件颜色重写
   */
  const initThemeColor = () => {
    return isDark.value ? darkOverrides() : lightOverrides();
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

    initThemeColor();

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
    changePrimary,
    initThemeColor
  };
};
