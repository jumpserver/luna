import { lighten, darken } from "./interface/index";
import { getThemeColor } from "./themes";

// 简化后的主题对象
export const dropdownTheme = {
  // 头部导航背景
  "--el-dropdown-bg-color": "#000000",
  // 头部导航字体颜色
  "--el-dropdown-text-color": "#EFEFF0",
  // 头部导航下拉菜单背景
  "--el-dropdown-selected-bg-color": lighten(5, getThemeColor()),
  // 头部导航下拉菜单 hover 背景
  "--el-dropdown-hover-bg-color": darken(4, getThemeColor()),
};
