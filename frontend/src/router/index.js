import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue') },
    { path: '/standings', name: 'standings', component: () => import('../views/StandingsView.vue') },
    { path: '/roster', name: 'roster', component: () => import('../views/RosterView.vue') },
    { path: '/media', name: 'media', component: () => import('../views/MediaView.vue') },
    { path: '/:slug', name: 'team-home', component: () => import('../views/HomeView.vue') },
    { path: '/admin/login', name: 'admin-login', component: () => import('../views/LoginView.vue') },
    {
      path: '/admin',
      name: 'admin-home',
      component: () => import('../views/AdminHomeView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    {
      path: '/admin/players',
      name: 'admin-players',
      component: () => import('../views/AdminPlayersView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    {
      path: '/admin/games',
      name: 'admin-games',
      component: () => import('../views/AdminGamesView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    {
      path: '/admin/standings',
      name: 'admin-standings',
      component: () => import('../views/AdminStandingsView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    {
      path: '/admin/teams',
      name: 'admin-teams',
      component: () => import('../views/AdminTeamsView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    {
      path: '/admin/teams/:id',
      name: 'admin-team-edit',
      component: () => import('../views/AdminTeamEditView.vue'),
      meta: { requiresAuth: true, layout: 'admin' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const { user, checked, checkSession } = useAuth()
  if (!checked.value) await checkSession()

  return user.value ? true : { name: 'admin-login' }
})

export default router
