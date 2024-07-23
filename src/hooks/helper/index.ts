import { GlobalThemeOverrides } from 'naive-ui';
import { initialThemeOverrides } from '@/ThemeOverrides.ts';

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
export const lightOverrides = () => {
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
    getCssVariableValue('--el-main-text-color');

  // Tag 相关
  (lightOverrides.Tag as NonNullable<GlobalThemeOverrides['Tag']>).textColor = getCssVariableValue(
    '--el-color-primary-light-1'
  );
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
  (lightOverrides.Dropdown as NonNullable<GlobalThemeOverrides['Dropdown']>).optionTextColorHover =
    '#fff';

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

  // 折叠面板
  (lightOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleTextColor =
    getCssVariableValue('--el-aside-tree-item-title-color');
  (lightOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleFontSize = '11px';
  (lightOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleFontWeight =
    '700';
  (lightOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).arrowColor =
    getCssVariableValue('--el-aside-tree-item-arrow-color');
  (lightOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).dividerColor =
    getCssVariableValue('--el-aside-tree-divider-color');

  // Tree
  (lightOverrides.Tree as NonNullable<GlobalThemeOverrides['Tree']>).fontSize = '13px';
  (lightOverrides.Tree as NonNullable<GlobalThemeOverrides['Tree']>).nodeTextColor =
    getCssVariableValue('--el-aside-tree-item-title-color');

  // 抽屉
  (lightOverrides.Drawer as NonNullable<GlobalThemeOverrides['Drawer']>).color =
    getCssVariableValue('--el-drawer-bg-color');

  return lightOverrides;
};

/**
 * @description 暗色模式下的颜色重设
 */
export const darkOverrides = () => {
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
    getCssVariableValue('--el-main-text-color');

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

  // 折叠面板
  (darkOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleTextColor =
    getCssVariableValue('--el-aside-tree-item-title-color');
  (darkOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleFontSize = '11px';
  (darkOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).titleFontWeight = '700';
  (darkOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).arrowColor =
    getCssVariableValue('--el-aside-tree-item-arrow-color');
  (darkOverrides.Collapse as NonNullable<GlobalThemeOverrides['Collapse']>).dividerColor =
    getCssVariableValue('--el-aside-tree-divider-color');

  // Tree
  (darkOverrides.Tree as NonNullable<GlobalThemeOverrides['Tree']>).fontSize = '13px';
  (darkOverrides.Tree as NonNullable<GlobalThemeOverrides['Tree']>).nodeTextColor =
    getCssVariableValue('--el-aside-tree-item-title-color');

  // 抽屉
  (darkOverrides.Drawer as NonNullable<GlobalThemeOverrides['Drawer']>).color =
    getCssVariableValue('--el-drawer-bg-color');

  return darkOverrides;
};
