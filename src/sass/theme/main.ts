import { Theme } from './interface/index';

export const mainTheme: Record<Theme.ThemeType, { [key: string]: string }> = {
  default: {
    '--el-main-bg-color': '#1E1C1C',
    '--el-main-text-color': '#a0a0a0',
    '--el-main-crucial-text-color': '#FF6347',
  },
  darkBlue: {
    '--el-main-bg-color': '#141618',
    '--el-main-text-color': '#f0f0f1',
    '--el-main-crucial-text-color': '#7494f3',
  }
};
