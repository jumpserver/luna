import {Theme} from './interface/index';

export const menuTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    // 侧边栏组织模块背景
    '--el-menu-org-bg-color': '#3B3333',
    // 资产区域背景
    '--el-assets-bg-color': '#302A2A',
    // 折叠面板项
    '--el-assets-fold-item-bg-color': '#3B3333',
    // 折叠面板展开时的背景
    '--el-assets-extend-bg-color': '#302A2A',
    // 下边框颜色
    '--el-border-color-x': '#2f2a2a',
    // 右边框颜色
    '--el-assets-border-right-color': 'rgba(58, 51, 51, 0.5)',
    // icon 颜色
    '--el-assets-icon-color': '#CCCCCC',
    // 滚动条的滚动块背景
    '--el-scroll-bar-thumb-bg-color': '#605959',
    // 滚动条轨道背景
    '--el-scroll-bar-track-bg-color': '#2A2525',
  },
  darkBlue: {
    // // 侧边栏组织模块背景
    '--el-menu-org-bg-color': '#24272D',
    // 资产区域背景
    '--el-assets-bg-color': '#1D1F26',
    // 折叠面板项
    '--el-assets-fold-item-bg-color': '#24272D',
    // 折叠面板展开时的背景
    '--el-assets-extend-bg-color': '#1D1F26',
    // 下边框颜色
    '--el-border-color-x': '#1f1b1b',
    // 右边框颜色
    '--el-assets-border-right-color': '#1f1b1b',
    // icon 颜色
    '--el-assets-icon-color': '#CCCCCC',
    // 滚动条的滚动块背景
    '--el-scroll-bar-thumb-bg-color': '#3B3F45',
    // 滚动条轨道背景
    '--el-scroll-bar-track-bg-color': '#2A2D32',
  }
};
