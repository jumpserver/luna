import { Theme } from './interface/index';

export const headerTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    // 头部导航背景
    '--el-header-nav-bg-color': '#483D3D',
    // 头部导航字体颜色
    '--el-header-nav-text-color': '#EFEFF0',
    // 头部导航下拉菜单背景
    '--el-header-nav-select-bg-color': '#3B3333',
    // 头部 tab item 背景
    '--el-header-tab-item-bg-color': '#3B3333',
    // 头部 tab icon 颜色
    '--el-header-tab-icon-color': '#ffffff',
    // 头部 dropdown item 禁用文本颜色
    '--el-header-dropdown-disable-text-color': '#c5babc',
    // border x 颜色
    '--el-border-color-x': '#5a5959',
    // border y 颜色
    '--el-border-color-y': '#1f1b1b',
    // icon hover 时的颜色
    '--el-icon-hover-color': '#d6cbcb'
  },
  darkBlue: {
    // 头部导航背景
    '--el-header-nav-bg-color': '#303237',
    // 头部导航字体颜色
    '--el-header-nav-text-color': '#EFEFF0',
    // 头部导航下拉菜单背景
    '--el-header-nav-select-bg-color': '#24272D',
    // 头部 tab item 背景
    '--el-header-tab-item-bg-color': '#24272D',
    // 头部 tab icon 颜色
    '--el-header-tab-icon-color': '#ffffff',
    // 头部 dropdown item 禁用文本颜色
    '--el-header-dropdown-disable-text-color': '#606266',
    // border x 颜色 todo)) 该模式下色值未确定
    '--el-border-color-x': '#5a5959',
    // border y 颜色 todo)) 该模式下色值未确定
    '--el-border-color-y': '#1f1b1b',
    // icon hover 时的颜色 todo)) 该模式下色值未确定
    '--el-icon-hover-color': '#d6cbcb'
  }
};
