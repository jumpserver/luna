import { lighten, darken } from './util';

export const themes = [
  {
    name: 'default',
    color: '#483D3D',
    label: 'Default'
  },
  {
    name: 'darkGary',
    color: '#303237',
    label: 'DarkGray'
  },
  {
    name: 'deepBlue',
    color: '#1A212C',
    label: 'DarkBlue'
  }
];

export const themeColors: any = themes.reduce((acc, theme) => {
  acc[theme.name] = theme.color;
  return acc;
}, {});

// 简化后的主题对象
export const mainTheme = () => {
  return {
    // 全局
    '--el-text-color-dark': '#000000d9',
    '--el-text-color-light': '#EFEFF0',
    // 滚动条的滚动块背景
    '--el-scroll-bar-thumb-bg-color': lighten(10),
    // 滚动条轨道背景
    '--el-scroll-bar-track-bg-color': darken(10),
    // 头部 tab icon 颜色
    '--el-icon-color': '#ffffff',
    // icon hover 时的颜色
    '--el-icon-hover-color': '#d6cbcb',
    // '--el-border-color-x': darken(30, '#000000', 0.4),
    // '--el-border-color-y': darken(30, '#000000', 0.4),
    '--el-border-color-x': 'rgba(0, 0, 0, 0.3)',
    '--el-border-color-y': 'rgba(0, 0, 0, 0.3)',

    // 头部导航背景
    '--el-nav-bg-color': lighten(0),

    // 主content区域背景
    '--el-main-bg-color': darken(13),
    // 断开连接的标签项背景
    '--el-tab-deactive-bg-color': lighten(10),
    // 编辑器背景
    '--el-editor-bg-color': darken(2),
    // 头部 tab item 背景
    '--el-tab-bg-color': darken(4),
    '--el-tab-sub-bg-color': darken(3),

    // 侧边栏
    // 侧边栏组织模块背景
    '--el-org-bg-color': darken(6),
    // 资产区域背景
    '--el-asset-tree-bg-color': darken(8),
    // 折叠面板项
    '--el-banner-bg-color': darken(4),
    // icon 颜色
    '--el-banner-icon-color': '#CCCCCC',

    // 下拉菜单或select
    '--el-dropdown-bg-color': '#000000',
    // 头部导航下拉菜单背景
    '--el-dropdown-selected-bg-color': lighten(5),
    // 头部导航下拉菜单 hover 背景
    '--el-dropdown-hover-bg-color': darken(4),
    // 下拉菜单或select 选中背景
    '--el-dropdown-active-bg-color': lighten(10),
    // 抽屉背景
    '--el-drawer-bg-color': darken(1),
    // 折叠面板背景
    '--el-drawer-collapse-bg-color': darken(2),
    // 分割线颜色
    '--el-divider-border-color': lighten(20),
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
