import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import SessionView from '../views/SessionView.vue';
import TimeAnalyzeView from '../views/TimeAnalyzeView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/:source/session/:id', component: SessionView },
  { path: '/:source/session/:id/time-analyze', component: TimeAnalyzeView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
