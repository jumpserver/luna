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
    async removeUserBySession(sessionToRemove: string) {
      const userToRemove = this.userInfo!.find(
        (item: IUserInfo) => item.session === sessionToRemove
      );

      if (!userToRemove) {
        console.error('要删除的用户不存在:', sessionToRemove);
        return { shouldShowLoginModal: false };
      }

      // 从用户列表中移除指定用户
      this.userInfo = this.userInfo!.filter((item: IUserInfo) => item.session !== sessionToRemove);

      let shouldShowLoginModal = false;

      // 如果移除的是当前用户，需要切换到其他用户或清空当前用户
      if (this.currentUser?.session === sessionToRemove) {
        if (this.userInfo && this.userInfo.length > 0) {
          // 切换到第一个可用用户
          const firstUser = this.userInfo[0];

          this.setCurrentUser(firstUser);
          this.setSession(firstUser.session);
          this.setCurrentSit(firstUser.currentSite as string);
          if (firstUser.csrfToken) {
            this.setCsrfToken(firstUser.csrfToken);
          }

          // 更新用户切换时间
          updateUserSwitchTime();

          // 等待恢复切换后用户的cookies
          try {
            await this.restoreUserCookies(firstUser);

            // 等待一小段时间让cookie和拦截器生效
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            console.error('恢复用户cookies失败:', error);
            // 如果cookie恢复失败，记录错误但继续执行
            // 这样至少用户状态是一致的
          }
        } else {
          // 没有其他用户了，重置状态
          this.reset();
          shouldShowLoginModal = true;
        }
      }
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

      return { shouldShowLoginModal };
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
