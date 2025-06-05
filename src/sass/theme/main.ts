import { lighten, darken } from "./interface/index";
import { getThemeColor } from "./themes";

// 简化后的主题对象
export const mainTheme = {
  // 主区域背景
  "--el-main-bg-color": darken(10, getThemeColor()),
  // 主区域文本颜色
  "--el-main-text-color": "#EFEFF0",
  // 关键文本颜色
  "--el-main-crucial-text-color": "#7494f3",
  // 断开连接的标签项背景
  "--el-main-tab-item-disconnected-bg-color": lighten(35, getThemeColor()),
  // 编辑器背景
  "--el-editor-bg-color": lighten(10, getThemeColor()),
};
