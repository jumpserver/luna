import { Theme } from '../types/index';

export const asideTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    '--el-aside-bg-color': '#F8F8F8',
    '--el-aside-tree-bg-color': 'F8F8F8',
    '--el-aside-text-color': '#303133',
    '--el-aside-border-color': '#e4e7ed'
  },
  dark: {
    '--el-aside-bg-color': '#292C33',
    '--el-aside-tree-bg-color': '#22252A',
    '--el-aside-logo-text-color': '#dadada',
    '--el-aside-text-color': '#ffffff',
    '--el-aside-border-color': '#414243'
  }
};
