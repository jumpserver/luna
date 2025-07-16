import { useI18n } from 'vue-i18n';
import { ref, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { useElectronConfig } from './useElectronConfig';
import { getAvatarImage } from '@renderer/utils/common';
import { useUserStore } from '@renderer/store/module/userStore';
import { getSystemSetting } from '@renderer/api/modals/setting';
import { createDiscreteApi, lightTheme, darkTheme } from 'naive-ui';
import { useSettingStore } from '@renderer/store/module/settingStore';
import { getProfile, getOrganization } from '@renderer/api/modals/user';
import { setUserRemoving } from '@renderer/api/index';
import mittBus from '@renderer/eventBus';

import type { ConfigProviderProps } from 'naive-ui';
import type { IUserInfo, IOrganization } from '@renderer/store/interface';

export const useUserAccount = () => {
  const { t } = useI18n();
  const router = useRouter();
  const userStore = useUserStore();
  const settingStore = useSettingStore();
  const defaultTheme = ref('');
  const showLoginModal = ref(false);

  const init = async () => {
    const { getDefaultSetting } = useElectronConfig();

    const { theme } = await getDefaultSetting();

    defaultTheme.value = theme;
  };

  /**
   * @description 设置新账号
   */
  const setNewAccount = () => {
    showLoginModal.value = true;
  };

  /**
   * @description 移除账号
   */
  const removeAccount = async (sessionToRemove?: string) => {
    // 如果指定了要删除的session，就删除指定的账号；否则删除当前账号
    const targetSession = sessionToRemove || userStore.currentUser?.session;

    if (!targetSession) {
      console.error('没有指定要删除的账号');
      return;
    }

    // 设置用户删除状态，防止在删除过程中触发401处理
    setUserRemoving(true);

    try {
      const result = await userStore.removeUserBySession(targetSession);

      // 如果没有其他用户了，显示登录模态框
      if (result?.shouldShowLoginModal) {
        showLoginModal.value = true;
        return;
      }

      // 如果删除的是当前用户，且还有其他用户，则切换到第一个可用用户
      if (result?.removedCurrentUser && userStore.userInfo && userStore.userInfo.length > 0) {
        const firstUser = userStore.userInfo[0];

        userStore.resetOrganization();
        await userStore.switchAccount(firstUser.session);

        try {
          const res = await getProfile();
          const orgRes = await getOrganization();
          await setUserOrganization(res.system_roles, orgRes);

          nextTick(() => {
            mittBus.emit('search', 'reset');
          });
        } catch (error) {
          console.error('获取用户信息失败，但不影响用户切换:', error);
        }
      } else {
        // userStore.currentUser = {};
        if (userStore.currentUser?.session) {
          await userStore.switchAccount(userStore.currentUser.session);
        }
      }
    } finally {
      setTimeout(() => {
        setUserRemoving(false);
      }, 1000);
    }
  };

  /**
   * @description 切换账号
   */
  const switchAccount = async (session: string) => {
    try {
      userStore.resetOrganization();
      // 调用userStore的switchAccount方法
      await userStore.switchAccount(session);

      // 获取系统设置（只有在cookies恢复成功后才执行）
      try {
        const setting = await getSystemSetting();
        const res = await getProfile();
        const orgRes = await getOrganization();

        await setUserOrganization(res.system_roles, orgRes);

        // 在组织设置完成后，触发数据刷新
        nextTick(() => {
          mittBus.emit('search', 'reset');
        });

        if (setting) {
          settingStore.setRdpClientOption(setting.graphics.rdp_client_option);
          settingStore.setKeyboardLayout(setting.graphics.keyboard_layout);
          settingStore.setRdpSmartSize(setting.graphics.rdp_smart_size);
          settingStore.setRdpColorQuality(setting.graphics.rdp_color_quality);
        }
      } catch (error) {
        console.error('获取系统设置失败:', error);
      }
    } catch (error) {
      console.error('切换账号失败:', error);
    }
  };

  /**
   * @description 设置用户组织信息
   */
  const setUserOrganization = (userRoles: any[], orgRes: any): Promise<void> => {
    const roleId = userRoles[0]?.id;

    switch (roleId) {
      // 普通用户
      case '00000000-0000-0000-0000-000000000003':
        if (orgRes.workbench_orgs?.length > 0) {
          userStore.setCurrentOrganization(orgRes.workbench_orgs[0]?.id);
          orgRes.workbench_orgs.forEach((org: IOrganization) => {
            userStore.setOrganization(org);
          });
        }
        return Promise.resolve();

      // 审计用户
      case '00000000-0000-0000-0000-000000000002':
        if (orgRes.audit_orgs?.length > 0) {
          userStore.setCurrentOrganization(orgRes.audit_orgs[0]?.id);
          orgRes.audit_orgs.forEach((org: IOrganization) => {
            userStore.setOrganization(org);
          });
        }
        return Promise.resolve();

      // 系统管理员
      case '00000000-0000-0000-0000-000000000001':
        if (orgRes.console_orgs?.length > 0) {
          orgRes.console_orgs.forEach((org: IOrganization) => {
            userStore.setOrganization(org);
          });

          return new Promise<void>(resolve => {
            nextTick(() => {
              userStore.setCurrentOrganization(orgRes.console_orgs[0]?.id);
              resolve();
            });
          });
        }
        return Promise.resolve();

      default:
        return Promise.resolve();
    }
  };

  /**
   * @description 处理登录凭据接收（session + csrfToken + site）
   */
  const _handleCredentialsReceived = async (credentials: {
    session: string;
    csrfToken: string;
    site: string;
  }) => {
    if (!credentials.session || !credentials.csrfToken) {
      return;
    }

    userStore.setSession(credentials.session);
    userStore.setCsrfToken(credentials.csrfToken);
    userStore.setCurrentSit(credentials.site);
    userStore.resetOrganization();

    try {
      const res = await getProfile();
      const orgRes = await getOrganization();

      if (res) {
        notification.create({
          type: 'success',
          content: t('Message.AuthenticatedSuccess'),
          duration: 2000
        });

        userStore.setUserInfo({
          session: credentials.session,
          username: res?.username,
          display_name: res?.system_roles.map((item: any) => item.display_name),
          avatar_url: await getAvatarImage(),
          currentSite: userStore.currentSite,
          csrfToken: userStore.csrfToken
        });

        userStore.setCurrentUser({
          session: credentials.session,
          username: res?.username,
          display_name: res?.system_roles.map((item: any) => item.display_name),
          avatar_url: await getAvatarImage(),
          currentSite: userStore.currentSite,
          csrfToken: userStore.csrfToken
        });

        // 确保新登录的用户cookies被保存到文件系统
        try {
          const allCookies = await window.electron.ipcRenderer.invoke(
            'get-site-cookies',
            userStore.currentSite,
            credentials.session
          );

          if (allCookies && allCookies.length > 0) {
            await window.electron.ipcRenderer.invoke('save-site-cookies', {
              site: userStore.currentSite,
              sessionId: credentials.session,
              cookies: allCookies
            });
          }
        } catch (error) {
          console.error('保存新登录用户的cookies失败:', error);
        }

        const setting = await getSystemSetting();

        // 设置用户组织信息
        await setUserOrganization(res.system_roles, orgRes);

        // 在组织设置完成后，触发数据刷新
        nextTick(() => {
          mittBus.emit('search', 'reset');
        });

        if (setting) {
          settingStore.setRdpClientOption(setting.graphics.rdp_client_option);
          settingStore.setKeyboardLayout(setting.graphics.keyboard_layout);
          settingStore.setRdpSmartSize(setting.graphics.rdp_smart_size);
          settingStore.setRdpColorQuality(setting.graphics.rdp_color_quality);
        }

        showLoginModal.value = false;

        router.push({ name: 'Linux' });
      }
    } catch (e) {
      showLoginModal.value = false;
    }

    // try {
    //   const currentRes = await getCurrent();

    //   if (currentRes) {
    //     userStore.setCurrentOrganization(currentRes?.id);
    //   }
    // } catch (e) {
    //   useMessage.error(t('Message.GetOrganizationFailed'));
    // }
  };

  const _handleCsrfTokenReceived = async (csrfToken: string) => {
    userStore.setCsrfToken(csrfToken);

    if (userStore.session) {
      userStore.updateUserInfo(userStore.session, { csrfToken });
    }
  };

  const handleCredentialsReceived = useDebounceFn(_handleCredentialsReceived, 2000);
  const handleCsrfTokenReceived = useDebounceFn(_handleCsrfTokenReceived, 2000);

  const handleModalOpacity = () => {
    showLoginModal.value = !showLoginModal.value;
  };

  init();

  const configProviderPropsRef = computed<ConfigProviderProps>(() => ({
    theme: defaultTheme.value === 'light' ? lightTheme : darkTheme
  }));

  const { notification } = createDiscreteApi(['message', 'notification'], {
    configProviderProps: configProviderPropsRef
  });

  const restoreSavedCookies = async (): Promise<boolean> => {
    const currentUser = userStore.currentUser as IUserInfo;

    if (currentUser && currentUser.session && currentUser.csrfToken && currentUser.currentSite) {
      if (!userStore.userInfo || userStore.userInfo.length === 0) {
        userStore.setUserInfo(currentUser);
      } else {
        const existingUser = userStore.userInfo.find(user => user.session === currentUser.session);
        if (!existingUser) {
          userStore.setUserInfo(currentUser);
        }
      }

      try {
        // 先验证cookies是否有效
        const validationResult = await window.electron.ipcRenderer.invoke(
          'validate-cookies',
          currentUser.currentSite,
          currentUser.session
        );

        if (!validationResult.valid) {
          console.warn('Cookies无效或过期:', validationResult.reason);

          // 如果cookies过期，清理过期账户
          if (validationResult.reason === 'Cookies expired') {
            await window.electron.ipcRenderer.invoke(
              'handle-401-error',
              currentUser.currentSite,
              currentUser.session
            );
          }

          return false;
        }

        let allCookies = await window.electron.ipcRenderer.invoke(
          'get-site-cookies',
          currentUser.currentSite,
          currentUser.session
        );

        // 如果内存中没有cookies（比如应用重启后），尝试从session中重新获取
        if (!allCookies || allCookies.length === 0) {
          allCookies = await window.electron.ipcRenderer.invoke(
            'get-cookies-from-session',
            currentUser.currentSite
          );

          // 如果成功获取到cookies，重新存储到内存中
          if (allCookies && allCookies.length > 0) {
            await window.electron.ipcRenderer.invoke('save-site-cookies', {
              site: currentUser.currentSite,
              sessionId: currentUser.session,
              cookies: allCookies
            });
          }
        }

        if (allCookies && allCookies.length > 0) {
          const result = await window.electron.ipcRenderer.invoke('restore-cookies', {
            site: currentUser.currentSite,
            sessionId: currentUser.session,
            csrfToken: currentUser.csrfToken,
            allCookies: allCookies
          });

          if (result && result.success) {
            console.log('Cookies恢复成功');
            return true;
          } else {
            console.error('恢复cookies失败:', result?.error);
            return false;
          }
        } else {
          console.warn('没有可用的cookies，用户可能需要重新登录');
          return false;
        }
      } catch (error) {
        console.error('恢复cookies失败:', error);
        return false;
      }
    }

    return false;
  };

  return {
    showLoginModal: showLoginModal,
    setNewAccount,
    switchAccount,
    removeAccount,
    setUserOrganization,
    handleModalOpacity,
    handleCredentialsReceived,
    handleCsrfTokenReceived,
    restoreSavedCookies
  };
};
