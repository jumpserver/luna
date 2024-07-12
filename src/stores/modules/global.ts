import { defineStore } from 'pinia';
import piniaPersistConfig from '@/stores/helper/persist';

import { DEFAULT_PRIMARY } from '@/config';
import type { GlobalState, ObjToKeyValArray } from '../interface/index';

export const useGlobalStore = defineStore({
  id: 'luna-global',
  state: (): GlobalState => ({
    // 深色模式
    isDark: true,
    // 全屏展示
    isFullScreen: false,
    token: '',
    JMSOrg: '',
    language: '',
    csrfToken: '',
    JMSLunaOra: '',
    HELP_SUPPORT_URL: '',
    HELP_DOCUMENT_URL: '',

    // 主题颜色
    primary: DEFAULT_PRIMARY,

    // 用户信息
    userInfo: { name: '' },
    interface: {}
  }),
  getters: {},
  actions: {
    setGlobalState(...args: ObjToKeyValArray<GlobalState>) {
      this.$patch({ [args[0]]: args[1] });
    },
    // 设置语言
    setLanguage(language: string) {
      this.language = language;
    },
    // 设置帮助选项中的跳转链接
    setHelpLink(HELP_SUPPORT_URL: string, HELP_DOCUMENT_URL: string) {
      this.HELP_SUPPORT_URL = HELP_SUPPORT_URL;
      this.HELP_DOCUMENT_URL = HELP_DOCUMENT_URL;
    }
  },
  persist: piniaPersistConfig('luna-user')
});
