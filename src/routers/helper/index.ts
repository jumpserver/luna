import { createDiscreteApi } from 'naive-ui';
import { getProfile } from '@/API/modules/user.ts';
import { useUserStore } from '@/stores/modules/user.ts';
import { useGlobalStore } from '@/stores/modules/global';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import { getPublicOption, getPublic, getConnectMethods } from '@/API/modules/init.ts';
import { getCsrfTokenFromCookie, getCurrentLanguage, getCookie } from '@/utils';
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router';

import { GlobalState } from '@/stores/interface';

const { message } = createDiscreteApi(['message']);

/**
 * @description 全局前置路由导航守卫
 */

export const guard = async (
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext
) => {
  const userStore = useUserStore();
  const globalStore = useGlobalStore();
  const loadingStore = useLoadingStore();

  const CSRFToken: string = getCsrfTokenFromCookie();
  const currentLanguage: string = getCurrentLanguage();
  const JMSOrg: string = getCookie('X-JMS-ORG');
  const JSMLunaOrg: string = getCookie('X-JMS-LUNA-ORG');

  try {
    const results = await Promise.allSettled([
      getPublicOption(),
      getPublic(),
      getProfile(),
      getConnectMethods()
    ]);

    const [publicOptionResult, publicResult, profileResult, connectMethodsResult] = results;

    if (publicOptionResult.status === 'fulfilled') {
      const { INTERFACE } = publicOptionResult.value;
      globalStore.setGlobalState('interface', INTERFACE);
    }

    if (publicResult.status === 'fulfilled') {
      const { HELP_SUPPORT_URL, HELP_DOCUMENT_URL } = publicResult.value;
      globalStore.setHelpLink(HELP_SUPPORT_URL, HELP_DOCUMENT_URL);
    }

    if (profileResult.status === 'fulfilled') {
      const { name, avatar_url, email, source, username, id } = profileResult.value;
      userStore.setUserId(id);
      userStore.setName(name);
      userStore.setEmail(email);
      userStore.setUserName(username);
      userStore.setAvatar(avatar_url);
      userStore.setSource(source.label);
    }

    if (connectMethodsResult.status === 'fulfilled') {
      // 这里你可以根据需要处理 connectMethodsResult.value
      globalStore.setGlobalState('connectMethods', connectMethodsResult.value);
    }

    const globalStates = {
      JMSOrg,
      csrfToken: CSRFToken,
      JMSLunaOra: JSMLunaOrg,
      language: currentLanguage
    } as Partial<GlobalState>;

    (Object.entries(globalStates) as [keyof GlobalState, any][]).forEach(([key, value]) => {
      globalStore.setGlobalState(key, value);
    });
  } catch (error: any) {
    // 请求超时 && 网络错误单独判断，没有 response
    if (error.message.indexOf('timeout') !== -1) message.error('请求超时！请您稍后重试');
    if (error.message.indexOf('Network Error') !== -1) message.error('网络错误！请您稍后重试');
    if (error.message.indexOf('500') !== -1) message.error('服务器异常，请刷新重试');
  } finally {
    loadingStore.stopLoading();
  }

  console.log(to, from);

  next();
};
