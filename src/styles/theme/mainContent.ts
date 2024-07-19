import { Theme } from '../types/index';

export const mainContentTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    '--el-main-header-bg-color': '#F8F8F8',
    '--el-main-text-color': '#dadada',
    '--el-main-bg-color': '#ffffff'
  },
  dark: {
    '--el-main-header-bg-color': '#252526',
    '--el-main-bg-color': '#1E1E1E',
    '--el-main-text-color': '#fff',
    '--el-main-nav-bg-color': '#3C3C3C'
  }
};
