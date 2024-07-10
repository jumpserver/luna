import { useGlobalStore } from '@/stores/modules/global.ts';

const globalStore = useGlobalStore();

/**
 * @type import('naive-ui').GlobalThemeOverrides
 */
export const LightThemeOverrides = {
  common: {
    primaryColor: globalStore.primary
  }
};

/**
 * @type import('naive-ui').GlobalThemeOverrides
 */
export const DarkThemeOverrides = {
  common: {
    primaryColor: '#FFFFFF'
  }
};
