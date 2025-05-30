import { Theme } from './interface/index';

export const mainTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-main-bg-color': '#1E1C1C',
    '--el-main-text-color': '#EFEFF0',
    '--el-main-crucial-text-color': '#7494f3',
    '--el-main-tab-item-disconnected-bg-color': '#5A5151',
  },
  darkBlue: {
    '--el-main-bg-color': '#141618',
    '--el-main-text-color': '#EFEFF0',
    '--el-main-crucial-text-color': '#7494f3',
    '--el-main-tab-item-disconnected-bg-color': '#555B60'
  }
};
