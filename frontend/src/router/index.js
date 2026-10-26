import { createRouter, createWebHistory } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'

const homeDescription = (team) => `האתר של ${team}: משחקים ותוצאות, טבלת הליגה, שחקנים, חדשות ומדיה.`
// parent: the nav section a sub-page belongs to, so the admin nav can highlight it.
const admin = (title, parent) => ({ requiresAuth: true, layout: 'admin', title, parent })

// Pre-#223 bare URLs (shared links) redirect to the remembered team's page, or to the picker when nothing is
// remembered, so a team the visitor never chose is never persisted.
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
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), beforeEnter: () => (useSelectedTeam().selectedTeamId.value ? true : { name: 'teams' }), meta: { description: homeDescription } },
    { path: '/:slug/schedule', name: 'schedule', component: () => import('../views/ScheduleView.vue'), meta: { title: 'לוח משחקים', description: (team) => `לוח המשחקים והתוצאות של ${team}.` } },
    { path: '/:slug/games/:id', name: 'game', component: () => import('../views/GameView.vue'), meta: { title: 'משחק', description: (team) => `משחק של ${team}: תאריך, מקום ותוצאה.` } },
    { path: '/:slug/standings', name: 'standings', component: () => import('../views/StandingsView.vue'), meta: { title: 'טבלה', description: (team) => `טבלת הליגה והמיקום של ${team}.` } },
    { path: '/:slug/roster', name: 'roster', component: () => import('../views/RosterView.vue'), meta: { title: 'שחקנים', description: (team) => `סגל השחקנים של ${team}.` } },
    { path: '/players/:id', name: 'player', component: () => import('../views/PlayerView.vue'), meta: { title: 'שחקן', description: () => 'פרופיל שחקן.' } },
    { path: '/:slug/media', name: 'media', component: () => import('../views/MediaView.vue'), meta: { title: 'מדיה', description: (team) => `תמונות, סרטונים וקישורים של ${team}.` } },
    { path: '/clubs/:clubSlug', name: 'club', component: () => import('../views/ClubView.vue') }, // not `slug`: useTeamFromRoute would treat it as a team; ClubView owns its head
    { path: '/:slug/club', redirect: { name: 'team-home' } }, // the pre-#372 club-week URL
    { path: '/:slug/stats', name: 'stats', component: () => import('../views/StatsView.vue'), meta: { title: 'נתונים', description: (team) => `סטטיסטיקת חמישיות של ${team}.`, noindex: true } },
    { path: '/:slug/playbook', name: 'playbook', component: () => import('../views/PlaybookView.vue'), meta: { title: 'פלייבוק', description: (team) => `מהלכי ${team}.`, noindex: true } },
    { path: '/teams', name: 'teams', component: () => import('../views/TeamsView.vue'), meta: { title: 'קבוצות', description: () => 'בחרו ליגה וקבוצה: משחקים, טבלה ושחקנים.' } },
    { path: '/teams/:leagueId(\\d+)', name: 'league-teams', component: () => import('../views/LeagueTeamsView.vue'), meta: { title: 'ליגה', description: () => 'הקבוצות בליגה: בחרו קבוצה למשחקים, לטבלה ולשחקנים.' } },
    { path: '/account', name: 'account', component: () => import('../views/AccountView.vue'), meta: { title: 'החשבון שלי', requiresUser: true, noindex: true } },
    { path: '/join', name: 'join', component: () => import('../views/JoinView.vue'), meta: { title: 'הצטרפות', requiresUser: true, noindex: true } },
    { path: '/:slug', name: 'team-home', component: () => import('../views/HomeView.vue'), meta: { description: homeDescription } },
    { path: '/admin/login', name: 'admin-login', component: () => import('../views/LoginView.vue'), meta: { title: 'כניסה' } },
    { path: '/admin/signup', name: 'admin-signup', component: () => import('../views/SignupView.vue'), meta: { title: 'הרשמה' } },
    { path: '/admin/verify-email', name: 'admin-verify-email', component: () => import('../views/VerifyEmailView.vue'), meta: { title: 'אימות אימייל' } },
    { path: '/admin/reset-password', name: 'admin-reset-password', component: () => import('../views/PasswordResetView.vue'), meta: { title: 'איפוס סיסמה' } },
    { path: '/admin', name: 'admin-home', component: () => import('../views/AdminHomeView.vue'), meta: admin('ניהול') },
    { path: '/:slug/admin', name: 'team-admin-home', component: () => import('../views/AdminHomeView.vue'), meta: admin('ניהול') },
    { path: '/:slug/admin/players', name: 'admin-players', component: () => import('../views/AdminPlayersView.vue'), meta: admin('ניהול שחקנים') },
    { path: '/:slug/admin/games', name: 'admin-games', component: () => import('../views/AdminGamesView.vue'), meta: admin('ניהול משחקים') },
    // ponytail: exists only to verify Sentry setup (#331); throws through AdminLayout -> ErrorBoundary.
    { path: '/admin/sentry-test', name: 'admin-sentry-test', component: { setup() { throw new Error('Sentry frontend test error') } }, meta: admin('בדיקת ניטור שגיאות') },
    { path: '/admin/standings', name: 'admin-standings', component: () => import('../views/AdminStandingsView.vue'), meta: admin('ניהול טבלה') },
    { path: '/admin/audit', name: 'admin-audit', component: () => import('../views/AdminAuditView.vue'), meta: admin('יומן שינויים', 'admin-home') },
    { path: '/admin/clubs', name: 'admin-clubs', component: () => import('../views/AdminClubsView.vue'), meta: admin('ניהול מועדונים') },
    { path: '/admin/clubs/:id', name: 'admin-club-edit', component: () => import('../views/AdminClubEditView.vue'), meta: admin('ניהול מועדון', 'admin-clubs') },
    { path: '/admin/teams', name: 'admin-teams', component: () => import('../views/AdminTeamsView.vue'), meta: admin('ניהול קבוצות') },
    { path: '/admin/users', name: 'admin-users', component: () => import('../views/AdminUsersView.vue'), meta: admin('ניהול משתמשים', 'admin-home') },
    { path: '/admin/teams/import', name: 'admin-teams-import', component: () => import('../views/AdminClubImportView.vue'), meta: admin('ייבוא קבוצות מאגודה', 'admin-teams') },
    { path: '/admin/teams/batch', name: 'admin-teams-batch-edit', component: () => import('../views/AdminTeamsBatchEditView.vue'), meta: admin('עריכת קבוצות', 'admin-teams') },
    { path: '/admin/teams/:id', name: 'admin-team-edit', component: () => import('../views/AdminTeamEditView.vue'), meta: admin('עריכת קבוצה', 'admin-teams') },
    ...LEGACY_PATHS.map(([path, name]) => ({ path, redirect: () => {
      const slug = useSelectedTeam().selectedTeamId.value
      return slug ? { name, params: { slug } } : { name: 'teams' }
    } })),
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'לא נמצא', noindex: true } },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.requiresUser) return true

  const { user, checked, checkSession } = useAuth()
  if (!checked.value) await checkSession()

  if (!user.value) return { name: 'admin-login' }
  if (to.meta.requiresUser) return true
  // A logged-in account without an admin grant never sees admin pages: its next step is /join.
  if (!user.value.is_admin) return { name: 'join' }
  // A team admin's home is their team's admin; the admin layout resolves the id to the slug.
  if (to.name === 'admin-home' && user.value.team_id) {
    return { name: 'team-admin-home', params: { slug: String(user.value.team_id) } }
  }
  return true
})

// Public pages: DefaultLayout owns the title (team name). Admin pages: page title.
router.afterEach((to) => {
  if (to.meta.layout === 'admin') document.title = `${to.meta.title} · GushBall`
})

export default router
