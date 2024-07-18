import { Theme } from '../types/index';

export const mainContentTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    '--el-main-header-bg-color': '#F8F8F8',
    '--el-main-text-color': '#dadada',
    '--el-main-bg-color': '#ffffff'
  },
  dark: {
    '--el-main-header-bg-color': '#292C33',
    '--el-main-bg-color': '#101014',
    '--el-main-text-color': '#dadada'
  }
};
