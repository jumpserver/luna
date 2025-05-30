import {Theme} from './interface/index';

export const headerTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-nav-bg-color': '#483D3D',
    // 头部 tab item 背景
    '--el-header-tab-item-bg-color': '#3B3333',
    // 头部 tab icon 颜色
    '--el-menu-icon-color': '#ffffff',
    // 头部 dropdown item 禁用文本颜色
    '--el-header-dropdown-disable-text-color': '#c5babc',
    // border x 颜色
    '--el-border-color-x': '#5A4F4F',
    // border y 颜色
    '--el-border-color-y': '#473C3C',
    // icon hover 时的颜色
    '--el-icon-hover-color': '#d6cbcb'
  },
  darkBlue: {
    '--el-nav-bg-color': '#303237',
    // 头部 tab item 背景
    '--el-header-tab-item-bg-color': '#24272D',
    // 头部 tab icon 颜色
    '--el-menu-icon-color': '#ffffff',
    // 头部 dropdown item 禁用文本颜色
    '--el-header-dropdown-disable-text-color': '#606266',
    // border x 颜色
    '--el-border-color-x': '#40454A',
    // border y 颜色
    '--el-border-color-y': '#202328',
    // icon hover 时的颜色
    '--el-icon-hover-color': '#d6cbcb'
  }
};
