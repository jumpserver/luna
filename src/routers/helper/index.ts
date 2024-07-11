import { createDiscreteApi } from 'naive-ui';
import { useGlobalStore } from '@/stores/modules/global';
import { useLoadingStore } from '@/stores/modules/loading.ts';
import { getPublicOption, getPublic } from '@/API/modules/init.ts';
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
  const globalStore = useGlobalStore();
  const loadingStore = useLoadingStore();

  const CSRFToken: string = getCsrfTokenFromCookie();
  const currentLanguage: string = getCurrentLanguage();
  const JMSOrg: string = getCookie('X-JMS-ORG');
  const JSMLunaOrg: string = getCookie('X-JMS-LUNA-ORG');

  try {
    const { INTERFACE } = await getPublicOption();
    const { HELP_SUPPORT_URL, HELP_DOCUMENT_URL } = await getPublic();
    const res = await Promise.allSettled([getPublicOption(), getPublic()]);

    const globalStates = {
      JMSOrg,
      csrfToken: CSRFToken,
      interface: INTERFACE,
      JMSLunaOra: JSMLunaOrg,
      language: currentLanguage
    } as Partial<GlobalState>;

    (Object.entries(globalStates) as [keyof GlobalState, any][]).forEach(([key, value]) => {
      globalStore.setGlobalState(key, value);
    });

    console.log(res);

    // globalStore.setGlobalState('JMSOrg', JMSOrg);
    // globalStore.setGlobalState('csrfToken', CSRFToken);
    // globalStore.setGlobalState('interface', INTERFACE);
    // globalStore.setGlobalState('JMSLunaOra', JSMLunaOrg);
    // globalStore.setGlobalState('language', currentLanguage);
    globalStore.setHelpLink(HELP_SUPPORT_URL, HELP_DOCUMENT_URL);
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
