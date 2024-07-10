import { createRouter, createWebHashHistory } from 'vue-router';
import { useGlobalStore } from '@/stores/modules/global';
import type { RouteRecordRaw } from 'vue-router';

import Layout from '@/layouts/index.vue';
import { getCsrfTokenFromCookie, getCurrentLanguage, getCookie } from '@/utils';
import { getPublicOption, getPublic } from '@/API/modules/init.ts';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: Layout
  }
];

const router = createRouter({
  routes,
  strict: true,
  history: createWebHashHistory(),
  scrollBehavior: () => ({ left: 0, top: 0 })
});

router.beforeEach(async (to, from, next) => {
  const globalStore = useGlobalStore();

  const CSRFToken: string = getCsrfTokenFromCookie();
  const currentLanguage: string = getCurrentLanguage();
  const JMSOrg: string = getCookie('X-JMS-ORG');
  const JSMLunaOrg: string = getCookie('X-JMS-LUNA-ORG');

  const { INTERFACE } = await getPublicOption();
  const { HELP_SUPPORT_URL, HELP_DOCUMENT_URL } = await getPublic();

  console.log(to, from);

  globalStore.setGlobalState('JMSOrg', JMSOrg);
  globalStore.setGlobalState('csrfToken', CSRFToken);
  globalStore.setGlobalState('interface', INTERFACE);
  globalStore.setGlobalState('JMSLunaOra', JSMLunaOrg);
  globalStore.setGlobalState('language', currentLanguage);
  globalStore.setHelpLink(HELP_SUPPORT_URL, HELP_DOCUMENT_URL);

  next();
});

export default router;
