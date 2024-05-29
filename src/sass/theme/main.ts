import { Theme } from './interface/index';

export const mainTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-aside-logo-text-color': '#dadada',
    '--el-aside-border-color': '#414243'
  },
  darkBlue: {
    '--el-main-bg-color': '#141618',
    '--el-main-text-color': '#f0f0f1',
  }
};
