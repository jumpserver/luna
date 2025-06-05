import { lighten, darken, alpha } from "./interface/index";
import { getThemeColor } from "./themes";

// 简化后的主题对象
export const menuTheme = {
  // 侧边栏组织模块背景
  "--el-menu-org-bg-color": darken(3, getThemeColor()),
  // 资产区域背景
  "--el-assets-bg-color": darken(7, getThemeColor()),
  // 折叠面板项
  "--el-assets-fold-item-bg-color": darken(3, getThemeColor()),
  // 折叠面板展开时的背景
  "--el-assets-extend-bg-color": darken(5, getThemeColor()),
  // 下边框颜色
  "--el-border-color-x": lighten(5, getThemeColor()),
  // 右边框颜色
  "--el-assets-border-right-color": alpha(0.5, lighten(20, getThemeColor())),
  // icon 颜色
  "--el-assets-icon-color": "#CCCCCC",
  // 滚动条的滚动块背景
  "--el-scroll-bar-thumb-bg-color": lighten(10, getThemeColor()),
  // 滚动条轨道背景
  "--el-scroll-bar-track-bg-color": lighten(5, getThemeColor()),
};
