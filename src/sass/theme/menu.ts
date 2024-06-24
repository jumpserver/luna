import { Theme } from './interface/index';

export const menuTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    // 侧边栏背景
    '--el-menu-bg-color': '#2f2a2a',
    // 侧边栏文字颜色
    '--el-menu-text-color': '#ffffff',
    // 侧边栏组织模块背景
    '--el-menu-org-bg-color': '#3B3333',
    // 侧边栏组织模块下拉框背景
    '--el-menu-select-bg-color': '#2E2828',
    // hover select 时的背景
    '--el-menu-select-hover-bg-color': '#484242',
    // 资产区域背景
    '--el-assets-bg-color': '#302A2A',
    // 折叠面板项
    '--el-assets-fold-item-bg-color': '#3B3333',
    // 折叠面板展开时的背景
    '--el-assets-extend-bg-color': '#302A2A',
    // 下边框颜色
    '--el-assets-border-bottom-color': '#2f2a2a',
    // 右边框颜色
    '--el-assets-border-right-color': 'rgba(58, 51, 51, 0.5)',
    // icon 颜色
    '--el-assets-icon-color': '#CCCCCC',
    // 滚动条的滚动块背景
    '--el-scroll-bar-thumb-bg-color': '#605959',
    // 滚动条轨道背景
    '--el-scroll-bar-track-bg-color': '#2A2525',
    // rMenu 背景
    '--el-rMenu-bg-color': '#000000',
    // rMenu 项 hover 背景
    '--el-rMenu-hover-bg-color': '#463e3e'
  },
  darkBlue: {
    // 侧边栏背景
    '--el-menu-bg-color': '#1D1F26',
    // 侧边栏文字颜色
    '--el-menu-text-color': '#ffffff',
    // 侧边栏组织模块背景
    '--el-menu-org-bg-color': '#24272D',
    // 侧边栏组织模块下拉框背景
    '--el-menu-select-bg-color': '#2F3238',
    // hover select 时的背景
    '--el-menu-select-hover-bg-color': '#41464D',
    // 资产区域背景
    '--el-assets-bg-color': '#1D1F26',
    // 折叠面板项
    '--el-assets-fold-item-bg-color': '#24272D',
    // 折叠面板展开时的背景
    '--el-assets-extend-bg-color': '#1D1F26',
    // 下边框颜色
    '--el-assets-border-bottom-color': '#1f1b1b',
    // 右边框颜色
    '--el-assets-border-right-color': '#1f1b1b',
    // icon 颜色
    '--el-assets-icon-color': '#CCCCCC',
    // 滚动条的滚动块背景
    '--el-scroll-bar-thumb-bg-color': '#3B3F45',
    // 滚动条轨道背景
    '--el-scroll-bar-track-bg-color': '#2A2D32',
    // rMenu 背景
    '--el-rMenu-bg-color': '#2F3238',
    // rMenu 项 hover 背景
    '--el-rMenu-hover-bg-color': '#41464D'
  }
};
