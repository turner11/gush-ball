import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'

const homeDescription = (team) => `האתר של ${team}: משחקים ותוצאות, טבלת הליגה, שחקנים, חדשות ומדיה.`
const admin = (title) => ({ requiresAuth: true, layout: 'admin', title })

// Pre-#223 bare URLs (shared links) redirect to the remembered team's page; '-' is never a real slug, so the
// layout's slug resolver then picks the remembered/first team.
const LEGACY_PATHS = [
  ['/schedule', 'schedule'],
  ['/standings', 'standings'],
  ['/roster', 'roster'],
  ['/media', 'media'],
  ['/stats', 'stats'],
  ['/admin/players', 'admin-players'],
  ['/admin/games', 'admin-games'],
]

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => saved ?? (to.hash ? { el: to.hash, top: 96 } : { top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { description: homeDescription } },
    { path: '/:slug/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue'), meta: { title: 'לוח משחקים', description: (team) => `לוח המשחקים והתוצאות של ${team}.` } },
    { path: '/:slug/standings', name: 'standings', component: () => import('../views/StandingsView.vue'), meta: { title: 'טבלה', description: (team) => `טבלת הליגה והמיקום של ${team}.` } },
    { path: '/:slug/roster', name: 'roster', component: () => import('../views/RosterView.vue'), meta: { title: 'שחקנים', description: (team) => `סגל השחקנים של ${team}.` } },
    { path: '/players/:id', name: 'player', component: () => import('../views/PlayerView.vue'), meta: { title: 'שחקן', description: () => 'פרופיל שחקן.' } },
    { path: '/:slug/media', name: 'media', component: () => import('../views/MediaView.vue'), meta: { title: 'מדיה', description: (team) => `תמונות, סרטונים וקישורים של ${team}.` } },
    { path: '/:slug/stats', name: 'stats', component: () => import('../views/StatsView.vue'), meta: { title: 'סטטיסטיקה', description: (team) => `סטטיסטיקת חמישיות של ${team}.` } },
    { path: '/:slug', name: 'team-home', component: () => import('../views/HomeView.vue'), meta: { description: homeDescription } },
    { path: '/admin/login', name: 'admin-login', component: () => import('../views/LoginView.vue'), meta: { title: 'כניסת מנהל' } },
    { path: '/admin/reset-password', name: 'admin-reset-password', component: () => import('../views/PasswordResetView.vue'), meta: { title: 'איפוס סיסמה' } },
    { path: '/admin', name: 'admin-home', component: () => import('../views/AdminHomeView.vue'), meta: admin('ניהול') },
    { path: '/:slug/admin', name: 'team-admin-home', component: () => import('../views/AdminHomeView.vue'), meta: admin('ניהול') },
    { path: '/:slug/admin/players', name: 'admin-players', component: () => import('../views/AdminPlayersView.vue'), meta: admin('ניהול שחקנים') },
    { path: '/:slug/admin/games', name: 'admin-games', component: () => import('../views/AdminGamesView.vue'), meta: admin('ניהול משחקים') },
    { path: '/admin/standings', name: 'admin-standings', component: () => import('../views/AdminStandingsView.vue'), meta: admin('ניהול טבלה') },
    { path: '/admin/teams', name: 'admin-teams', component: () => import('../views/AdminTeamsView.vue'), meta: admin('ניהול קבוצות') },
    { path: '/admin/teams/:id', name: 'admin-team-edit', component: () => import('../views/AdminTeamEditView.vue'), meta: admin('עריכת קבוצה') },
    ...LEGACY_PATHS.map(([path, name]) => ({ path, redirect: () => ({ name, params: { slug: useSelectedTeam().selectedTeamId.value ?? '-' } }) })),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'לא נמצא', noindex: true } },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const { user, checked, checkSession } = useAuth()
  if (!checked.value) await checkSession()

  if (!user.value) return { name: 'admin-login' }
  // A team admin's home is their team's admin; the admin layout resolves the id to the slug.
  if (to.name === 'admin-home' && user.value.team_id) {
    return { name: 'team-admin-home', params: { slug: String(user.value.team_id) } }
  }
  return true
})

// Public pages: DefaultLayout owns the title (team name). Admin pages: page title.
router.afterEach((to) => {
  if (to.meta.layout === 'admin') document.title = `${to.meta.title} · גוש כדורסל`
})

export default router
