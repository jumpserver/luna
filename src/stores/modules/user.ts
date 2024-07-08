import { defineStore } from 'pinia';
import type { UserState } from '../interface/index';
import piniaPersistConfig from '@/stores/helper/persist';

export const useUserStore = defineStore({
  id: 'luna-user',
  state: (): UserState => ({
    token: '',
    JMSOrg: '',
    language: '',
    csrfToken: '',
    JMSLunaOra: '',
    userInfo: { name: '' }
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
    setUserInfo(userInfo: UserState['userInfo']) {
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
    }
  },
  persist: piniaPersistConfig('luna-user')
});
