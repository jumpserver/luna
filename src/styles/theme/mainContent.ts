import { Theme } from '../types/index';

export const mainContentTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    // 主体
    '--el-main-bg-color': '#ffffff',
    '--el-main-text-color': '#000000AD',

    // tab
    '--el-main-tab-bg-color': '#F3F3F3',
    '--el-main-tab-text-color': '#333333',
    '--el-main-tab-icon-color': '#424242',
    '--el-main-tab-icon-hover-color': '#B8B8B84F',

    // 顶部 nav
    '--el-main-nav-bg-color': '#E5E5E5'
  },
  dark: {
    // 主体
    '--el-main-bg-color': '#1E1E1E',
    '--el-main-text-color': '#CCCCCC',

    // tab
    '--el-main-tab-bg-color': '#252526',
    '--el-main-tab-text-color': '#FFFFFF',
    '--el-main-tab-icon-color': '#c5c5c5',
    '--el-main-tab-icon-hover-color': '#5A5D5E4F',

    // 顶部 nav
    '--el-main-nav-bg-color': '#3C3C3C'
  }
};
