import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import SessionView from '../views/SessionView.vue';
import TimeAnalyzeView from '../views/TimeAnalyzeView.vue';

const routes = [
  { path: '/', component: HomeView },
  { path: '/session/:id', component: SessionView },
  { path: '/time-analyze/:id', component: TimeAnalyzeView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
