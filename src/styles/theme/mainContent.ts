import { Theme } from '../types/index';

export const mainContentTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    '--el-main-bg-color': '#F8F8F8',
    '--el-main-text-color': '#dadada'
  },
  dark: {
    '--el-main-bg-color': '#292C33',
    '--el-main-text-color': '#dadada'
  }
};
