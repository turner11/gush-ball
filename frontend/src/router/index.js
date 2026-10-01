import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const admin = (title) => ({ requiresAuth: true, layout: 'admin', title })

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => saved ?? (to.hash ? { el: to.hash, top: 96 } : { top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue'), meta: { title: 'לוח משחקים' } },
    { path: '/standings', name: 'standings', component: () => import('../views/StandingsView.vue'), meta: { title: 'טבלה' } },
    { path: '/roster', name: 'roster', component: () => import('../views/RosterView.vue'), meta: { title: 'שחקנים' } },
    { path: '/players/:id', name: 'player', component: () => import('../views/PlayerView.vue'), meta: { title: 'שחקן' } },
    { path: '/media', name: 'media', component: () => import('../views/MediaView.vue'), meta: { title: 'מדיה' } },
    { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue'), meta: { title: 'סטטיסטיקה' } },
    { path: '/:slug', name: 'team-home', component: () => import('../views/HomeView.vue') },
    { path: '/admin/login', name: 'admin-login', component: () => import('../views/LoginView.vue'), meta: { title: 'כניסת מנהל' } },
    { path: '/admin/reset-password', name: 'admin-reset-password', component: () => import('../views/PasswordResetView.vue'), meta: { title: 'איפוס סיסמה' } },
    { path: '/admin', name: 'admin-home', component: () => import('../views/AdminHomeView.vue'), meta: admin('ניהול') },
    { path: '/admin/players', name: 'admin-players', component: () => import('../views/AdminPlayersView.vue'), meta: admin('ניהול שחקנים') },
    { path: '/admin/games', name: 'admin-games', component: () => import('../views/AdminGamesView.vue'), meta: admin('ניהול משחקים') },
    { path: '/admin/standings', name: 'admin-standings', component: () => import('../views/AdminStandingsView.vue'), meta: admin('ניהול טבלה') },
    { path: '/admin/teams', name: 'admin-teams', component: () => import('../views/AdminTeamsView.vue'), meta: admin('ניהול קבוצות') },
    { path: '/admin/teams/:id', name: 'admin-team-edit', component: () => import('../views/AdminTeamEditView.vue'), meta: admin('עריכת קבוצה') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'לא נמצא' } },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const { user, checked, checkSession } = useAuth()
  if (!checked.value) await checkSession()

  return user.value ? true : { name: 'admin-login' }
})

// Public pages: DefaultLayout owns the title (team name). Admin pages: page title.
router.afterEach((to) => {
  if (to.meta.layout === 'admin') document.title = `${to.meta.title} · גוש כדורסל`
})

export default router
