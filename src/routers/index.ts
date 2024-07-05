import { createRouter, createWebHashHistory } from 'vue-router';
import { useUserStore } from '@/stores/modules/user';
import type { RouteRecordRaw } from 'vue-router';

import Layout from '@/layouts/index.vue';
import { getCsrfTokenFromCookie, getCurrentLanguage, getCookie } from '@/utils';

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

router.beforeEach((to, from, next) => {
  const userStore = useUserStore();

  const CSRFToken: string = getCsrfTokenFromCookie();
  const currentLanguage: string = getCurrentLanguage();
  const JMSOrg: string = getCookie('X-JMS-ORG');
  const JSMLunaOrg: string = getCookie('X-JMS-LUNA-ORG');

  console.log(to, from);

  userStore.setOrganize(JMSOrg);
  userStore.setCSRFToken(CSRFToken);
  userStore.setLunaOrganize(JSMLunaOrg);
  userStore.setLanguage(currentLanguage);

  console.log(userStore);

  next();
});

export default router;
