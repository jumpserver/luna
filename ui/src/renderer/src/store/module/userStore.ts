import { defineStore } from 'pinia';
import { IUserInfo } from '@renderer/store/interface';
import { piniaPersistConfig } from '@renderer/store/helper';

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
    removeUserBySession(session: string) {
      const userToRemove = this.userInfo!.find((item: IUserInfo) => item.session === session);

      if (userToRemove) {
        // 从用户列表中移除指定用户
        this.userInfo = this.userInfo!.filter((item: IUserInfo) => item.session !== session);

        // 如果移除的是当前用户，需要切换到其他用户或清空当前用户
        if (this.currentUser?.session === session) {
          if (this.userInfo && this.userInfo.length > 0) {
            // 切换到第一个可用用户
            const firstUser = this.userInfo[0];
            this.setCurrentUser(firstUser);
            this.setSession(firstUser.session);
            this.setCurrentSit(firstUser.currentSite as string);
            if (firstUser.csrfToken) {
              this.setCsrfToken(firstUser.csrfToken);
            }

            // 恢复切换后用户的cookies
            this.restoreUserCookies(firstUser);
          } else {
            // 没有其他用户了，重置状态
            this.reset();
            return { shouldShowLoginModal: true }; // 返回标记，表示需要显示登录模态框
          }
        } else {
          // 删除的不是当前用户，检查是否还有其他用户
          if (this.userInfo.length === 0) {
            this.reset();
            return { shouldShowLoginModal: true };
          }
        }

        // 清理该用户的cookie
        window.electron.ipcRenderer.send('clear-site-cookies', userToRemove.currentSite, session);
      }

      return { shouldShowLoginModal: false };
    },
    async restoreUserCookies(user: IUserInfo) {
      try {
        const allCookies = await window.electron.ipcRenderer.invoke(
          'get-site-cookies',
          user.currentSite,
          user.session
        );

        await window.electron.ipcRenderer.invoke('restore-cookies', {
          site: user.currentSite,
          sessionId: user.session,
          csrfToken: user.csrfToken || '',
          allCookies: allCookies
        });
      } catch (error) {
        console.error('恢复用户cookies失败:', error);
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
