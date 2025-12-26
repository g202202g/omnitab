import { createRouter as createVueRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import PageBoard from './views/PageBoard.vue';
import SettingsPage from './views/SettingsPage.vue';

const routes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'settings',
    component: SettingsPage,
  },
  {
    path: '/:pageId?',
    name: 'page',
    component: PageBoard,
    props: (route) => ({ pageId: route.params.pageId as string | undefined }),
  },
];

export function createRouter() {
  return createVueRouter({
    history: createWebHashHistory(),
    routes,
  });
}
