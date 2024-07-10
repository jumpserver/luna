import { Theme } from '../types/index';

export const asideTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    '--el-aside-bg-color': '#F5F6F7',
    '--el-aside-text-color': '#303133',
    '--el-aside-border-color': '#e4e7ed'
  },
  dark: {
    '--el-aside-bg-color': '',
    '--el-aside-logo-text-color': '#dadada',
    '--el-aside-border-color': '#414243'
  }
};
