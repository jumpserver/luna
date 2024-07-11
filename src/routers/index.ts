import { guard } from './helper/index.ts';
import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

import Layout from '@/layouts/index.vue';

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

router.beforeEach(guard);

export default router;
