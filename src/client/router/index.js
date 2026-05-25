import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import SessionView from '../views/SessionView.vue';
import TimeAnalyzeView from '../views/TimeAnalyzeView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/session/:id', component: SessionView },
  { path: '/session/:id/time-analyze', component: TimeAnalyzeView },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
