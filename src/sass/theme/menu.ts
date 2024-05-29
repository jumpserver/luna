import { Theme } from './interface/index';

export const menuTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-menu-bg-color': '#2f2a2a',
    '--el-menu-text-color': '#d6cbcb',
    '--el-menu-select-bg-color': '#24272D',
    '--el-menu-panel-item-bg-color': '#1F2328',
    '--el-menu-fold-panel-bg-color': '#1D1F26',
    '--el-menu-tab-item-bg-color': '#2f2a2a'
  },
  darkBlue: {
    '--el-menu-bg-color': '#303237',
    '--el-menu-text-color': '#f0f0f1',
    '--el-menu-select-bg-color': '#24272D',
    '--el-menu-panel-item-bg-color': '#1F2328',
    '--el-menu-fold-panel-bg-color': '#1D1F26',
    '--el-menu-tab-item-bg-color': '#1B1D23'
  }
};
