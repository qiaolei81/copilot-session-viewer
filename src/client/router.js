import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/session/:id', component: () => import('./views/SessionView.vue') },
    { path: '/session/:id/time-analyze', component: () => import('./views/TimeAnalyzeView.vue') },
  ],
});

export default router;
