import { defineStore } from 'pinia';
import { IUserInfo } from '@renderer/store/interface';
import { piniaPersistConfig } from '@renderer/store/helper';
import { updateUserSwitchTime } from '@renderer/api/index';

import type { IUser, IOrganization } from '@renderer/store/interface';

export const useUserStore = defineStore('client-user', {
  state: (): Partial<IUser> => ({
    loading: false,

    sort: 'name',
    session: '',
    csrfToken: '',
    currentSite: '',
    currentOrganization: '',

    userInfo: [],
    organization: [],
    currentUser: {}
  }),
  actions: {
    setSession(session: string) {
      this.session = session;
    },
    setCsrfToken(csrfToken: string) {
      this.csrfToken = csrfToken;
    },
    setCurrentSit(site: string) {
      this.currentSite = site;
    },
    setUserInfo(userInfo: IUserInfo) {
      const existingUserIndex = this.userInfo!.findIndex(
        (item: IUserInfo) => item.session === userInfo.session
      );

      if (existingUserIndex !== -1) {
        this.userInfo![existingUserIndex] = { ...this.userInfo![existingUserIndex], ...userInfo };
      } else {
        this.userInfo!.push(userInfo);
      }
    },
    updateUserInfo(session: string, updates: Partial<IUserInfo>) {
      const userIndex = this.userInfo!.findIndex((item: IUserInfo) => item.session === session);

      if (userIndex !== -1) {
        this.userInfo![userIndex] = { ...this.userInfo![userIndex], ...updates };
      }
    },
    setLoading(status: boolean) {
      this.loading = status;
    },
    setCurrentUser(currentUser: IUserInfo) {
      this.currentUser = currentUser;
    },
    removeCurrentUser() {
      this.userInfo = this.userInfo!.filter(
        (item: IUserInfo) => item.session !== this.currentUser!.session
      );
    },
    async switchAccount(targetSession: string) {
      if (targetSession === this.session) {
        return; // 已经是当前用户，无需切换
      }

      if (this.userInfo) {
        const user = this.userInfo.find((item: IUserInfo) => item.session === targetSession);

        if (user) {
          // 更新用户状态
          this.setCurrentUser(user);
          this.setSession(user.session);
          this.setCurrentSit(user.currentSite as string);
          if (user.csrfToken) {
            this.setCsrfToken(user.csrfToken);
          }

          // 更新用户切换时间
          updateUserSwitchTime();

          // 恢复cookies和拦截器
          await this.restoreUserCookies(user);
        } else {
          console.error('找不到要切换的用户:', targetSession);
        }
      }
    },
    async removeUserBySession(sessionToRemove: string) {
      const userToRemove = this.userInfo!.find(
        (item: IUserInfo) => item.session === sessionToRemove
      );

      if (!userToRemove) {
        console.error('要删除的用户不存在:', sessionToRemove);
        return { shouldShowLoginModal: false, removedCurrentUser: false };
      }

      // 记录是否删除的是当前用户
      const removedCurrentUser = this.currentUser?.session === sessionToRemove;

      // 从用户列表中移除指定用户
      this.userInfo = this.userInfo!.filter((item: IUserInfo) => item.session !== sessionToRemove);

      // 清理该用户的cookie和相关数据
      try {
        await window.electron.ipcRenderer.invoke(
          'clear-site-cookies',
          userToRemove.currentSite,
          sessionToRemove
        );
        await window.electron.ipcRenderer.invoke(
          'clear-user-interceptor',
          userToRemove.currentSite,
          sessionToRemove
        );
      } catch (error) {
        console.error('清理用户数据失败:', error);
      }

      // 如果删除的是当前用户且没有其他用户，需要重置状态
      if (removedCurrentUser && (!this.userInfo || this.userInfo.length === 0)) {
        this.reset();
        return { shouldShowLoginModal: true, removedCurrentUser };
      }

      return { shouldShowLoginModal: false, removedCurrentUser };
    },
    async restoreUserCookies(user: IUserInfo) {
      try {
        const allCookies = await window.electron.ipcRenderer.invoke(
          'get-site-cookies',
          user.currentSite,
          user.session
        );

        const result = await window.electron.ipcRenderer.invoke('restore-cookies', {
          site: user.currentSite,
          sessionId: user.session,
          csrfToken: user.csrfToken || '',
          allCookies: allCookies
        });

        if (!result.success) {
          console.error('恢复cookies失败:', result.error);
          throw new Error(result.error);
        }
      } catch (error) {
        console.error('恢复用户cookies失败:', error);
        throw error;
      }
    },
    setCurrentListSort(type) {
      this.sort = type;
    },
    setOrganization(orgInfo: IOrganization) {
      this.organization?.push({
        id: orgInfo.id,
        is_default: orgInfo.is_default,
        is_root: orgInfo.is_root,
        is_system: orgInfo.is_system,
        name: orgInfo.name
      });
    },
    setCurrentOrganization(orgId: string) {
      this.currentOrganization = orgId;
    },
    reset() {
      this.session = '';
      this.loading = false;
      this.userInfo = [];
      this.currentSite = '';
      this.currentUser = {};
      this.currentOrganization = '';
      this.organization = [];
    },
    resetOrganization() {
      this.currentOrganization = '';
      this.organization = [];
    }
  },
  persist: piniaPersistConfig('client-user')
});
