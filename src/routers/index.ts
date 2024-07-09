import { createRouter, createWebHashHistory } from 'vue-router';
import { useGlobalStore } from '@/stores/modules/global';
import type { RouteRecordRaw } from 'vue-router';

import Layout from '@/layouts/index.vue';
import { getCsrfTokenFromCookie, getCurrentLanguage, getCookie } from '@/utils';
import { getPublicSetting } from '@/API/modules/init.ts';

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

  const { INTERFACE } = await getPublicSetting();

  console.log(to, from);

  globalStore.setOrganize(JMSOrg);
  globalStore.setCSRFToken(CSRFToken);
  globalStore.setInterface(INTERFACE);
  globalStore.setLunaOrganize(JSMLunaOrg);
  globalStore.setLanguage(currentLanguage);

  next();
});

export default router;
