import {Theme} from './interface/index';

export const dropdownTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    // 头部导航背景
    '--el-dropdown-bg-color': '#000000',
    // 头部导航字体颜色
    '--el-dropdown-text-color': '#EFEFF0',
    // 头部导航下拉菜单背景
    '--el-dropdown-selected-bg-color': '#000000',
    // 头部导航下拉菜单 hover 背景
    '--el-dropdown-hover-bg-color': '#303133',
  },
  darkBlue: {
    // 头部导航背景
    '--el-dropdown-bg-color': '#000000',
    // 头部导航字体颜色
    '--el-dropdown-text-color': '#EFEFF0',
    // 头部导航下拉菜单背景
    '--el-dropdown-selected-bg-color': '#2F3238',
    // 头部 tab select 背景
    '--el-dropdown-hover-bg-color': '#41464D',
  }
};
