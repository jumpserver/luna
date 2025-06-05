import { lighten, darken } from "./util";

export const themeColors: any = {
  default: "#483D3D",
  darkBlue: "#303237",
};

// 简化后的主题对象
export const mainTheme = () => {
  return {
    "--el-text-color-dark": "#000000d9",
    "--el-text-color-light": "#EFEFF0",
    // 主区域背景
    "--el-main-bg-color": darken(10),
    // 主区域文本颜色
    "--el-main-text-color": "#EFEFF0",
    // 关键文本颜色
    "--el-main-crucial-text-color": "#7494f3",
    // 断开连接的标签项背景
    "--el-main-tab-item-disconnected-bg-color": lighten(35),
    // 编辑器背景
    "--el-editor-bg-color": lighten(10),
    // 头部导航背景
    "--el-nav-bg-color": lighten(0),
    // 头部导航字体颜色
    "--el-header-text-color": "#EFEFF0",
    // 头部 tab item 背景
    "--el-header-tab-item-bg-color": darken(5),
    // 头部 tab icon 颜色
    "--el-menu-icon-color": "#ffffff",
    // 头部 dropdown item 禁用文本颜色
    "--el-header-dropdown-disable-text-color": "#c5babc",
    // border 颜色
    "--el-border-color-x": "#202020",
    "--el-border-color-y": "#202020",
    // icon hover 时的颜色
    "--el-icon-hover-color": "#d6cbcb",
    // 侧边栏组织模块背景
    "--el-menu-org-bg-color": darken(4),
    // 资产区域背景
    "--el-assets-bg-color": darken(6),
    // 折叠面板项
    "--el-assets-fold-item-bg-color": darken(3),
    // 折叠面板展开时的背景
    "--el-assets-extend-bg-color": darken(6),
    // icon 颜色
    "--el-assets-icon-color": "#CCCCCC",
    // 滚动条的滚动块背景
    "--el-scroll-bar-thumb-bg-color": lighten(10),
    // 滚动条轨道背景
    "--el-scroll-bar-track-bg-color": lighten(5),
    // 头部导航背景
    "--el-dropdown-bg-color": "#000000",
    // 头部导航下拉菜单背景
    "--el-dropdown-selected-bg-color": lighten(5),
    // 头部导航下拉菜单 hover 背景
    "--el-dropdown-hover-bg-color": darken(4),
    // 抽屉背景
    '--el-drawer-bg-color': darken(1),
    // 折叠面板背景
    '--el-drawer-collapse-bg-color': darken(2),
    // 分割线颜色
    '--el-divider-border-color': lighten(10),
    // 表单 hover 边框颜色
    '--el-form-hover-border-color': lighten(20),
    // 表单 focus 边框颜色
    '--el-form-focus-border-color': lighten(30),
    // segmented 背景
    '--el-segmented-bg-color': lighten(5),
    // segmented hover 背景
    '--el-segmented-hover-bg-color': lighten(10)
  };
};
