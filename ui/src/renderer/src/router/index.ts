import type { RouteRecordRaw } from 'vue-router';

import { createRouter, createWebHashHistory } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'homePage',
    component: () => import('../layouts/index.vue'),
    redirect: '',
    children: [
      {
        path: 'linux',
        name: 'Linux',
        component: () => import('@renderer/views/Linux/index.vue'),
      },
      {
        path: 'windows',
        name: 'Windows',
        component: () => import('@renderer/views/Windows/index.vue'),
      },
      {
        path: 'database',
        name: 'Database',
        component: () => import('@renderer/views/Database/index.vue'),
      },
      {
        path: 'device',
        name: 'Device',
        component: () => import('@renderer/views/Device/index.vue'),
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@renderer/views/History/index.vue'),
      },
      {
        path: 'favorite',
        name: 'Favorite',
        component: () => import('@renderer/views/Favorite/index.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export { router };
