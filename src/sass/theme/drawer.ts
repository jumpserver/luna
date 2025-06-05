import { Theme } from './interface/index';

export const drawerTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-drawer-bg-color': '#302A2A',
    // 文本颜色
    '--el-drawer-text-color': '#ffffff',
    // 折叠面板背景
    '--el-drawer-collapse-bg-color': '#1E1C1C'
  },
  darkBlue: {
    '--el-drawer-bg-color': '#1D1F26',

    // 文本颜色
    '--el-drawer-text-color': '#ffffff',

    // 折叠面板背景
    '--el-drawer-collapse-bg-color': '#24272D'
  }
};
