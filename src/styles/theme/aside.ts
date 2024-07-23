import { Theme } from '../types/index';

export const asideTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  light: {
    // 侧边部分
    '--el-aside-bg-color': '#2C2C2C',

    // tree 部分
    '--el-aside-tree-bg-color': '#F3F3F3',
    '--el-aside-tree-head-title-color': '#6F6F6F',
    '--el-aside-tree-item-title-color': '#616161',
    '--el-aside-tree-item-arrow-color': '#424242',
    '--el-aside-tree-divider-color': '#61616130',

    // 抽屉
    '--el-drawer-bg-color': '#F3F3F3'
  },
  dark: {
    // 侧边部分
    '--el-aside-bg-color': '#333333',

    // tree 部分
    '--el-aside-tree-bg-color': '#252526',
    '--el-aside-tree-head-title-color': '#BBBBBB',
    '--el-aside-tree-item-title-color': '#CCCCCC',
    '--el-aside-tree-item-arrow-color': '#c5c5c5',
    '--el-aside-tree-divider-color': '#CCCCCC33',

    // 抽屉
    '--el-drawer-bg-color': '#252526'
  }
};
