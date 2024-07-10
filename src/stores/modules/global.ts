import { defineStore } from 'pinia';
import piniaPersistConfig from '@/stores/helper/persist';

import type { GlobalState, OpenSetting } from '../interface/index';

export const useGlobalStore = defineStore({
  id: 'luna-global',
  state: (): GlobalState => ({
    token: '',
    JMSOrg: '',
    language: '',
    csrfToken: '',
    JMSLunaOra: '',
    HELP_SUPPORT_URL: '',
    HELP_DOCUMENT_URL: '',
    userInfo: { name: '' },
    interface: {}
  }),
  getters: {},
  actions: {
    // 设置 Token
    setToken(token: string) {
      this.token = token;
    },
    // 设置 CSRF Token
    setCSRFToken(csrfToken: string) {
      this.csrfToken = csrfToken;
    },
    // 设置用户信息
    setUserInfo(userInfo: GlobalState['userInfo']) {
      this.userInfo = userInfo;
    },
    // 设置语言
    setLanguage(language: string) {
      this.language = language;
    },
    // 设置组织
    setLunaOrganize(org: string) {
      this.JMSLunaOra = org;
    },
    // 设置组织
    setOrganize(org: string) {
      this.JMSOrg = org;
    },
    // 设置全局配置
    setInterface(setting: OpenSetting) {
      this.interface = setting;
    },
    // 设置帮助选项中的跳转链接
    setHelpLink(HELP_SUPPORT_URL: string, HELP_DOCUMENT_URL: string) {
      this.HELP_SUPPORT_URL = HELP_SUPPORT_URL;
      this.HELP_DOCUMENT_URL = HELP_DOCUMENT_URL;
    }
  },
  persist: piniaPersistConfig('luna-user')
});
