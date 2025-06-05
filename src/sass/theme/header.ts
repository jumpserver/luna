import { lighten, darken } from "./interface/index";
import { getThemeColor } from "./themes";

// 简化后的主题对象
export const headerTheme = {
  // 头部导航背景
  "--el-nav-bg-color": getThemeColor(),
  // 头部导航字体颜色
  "--el-header-text-color": "#EFEFF0",
  // 头部 tab item 背景
  "--el-header-tab-item-bg-color": darken(5, getThemeColor()),
  // 头部 tab icon 颜色
  "--el-menu-icon-color": "#ffffff",
  // 头部 dropdown item 禁用文本颜色
  "--el-header-dropdown-disable-text-color": "#c5babc",
  // border 颜色
  "--el-border-color-x": "#202020",
  "--el-border-color-y": "#202020",
  // icon hover 时的颜色
  "--el-icon-hover-color": "#d6cbcb",
};
