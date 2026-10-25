import { computed, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { byAffinity } from '../lib/favorites'

const user = ref(null)
const checked = ref(false)
const error = ref(null)
// team_ids: null = full admin, else the team ids this team/club admin may touch (server-enforced).
export const fullAdmin = computed(() => !user.value?.team_ids)
// The account public pages render for: null in the anonymous preview. Content gates only; the account menu and
// admin pages keep `user`.
export const viewer = computed(() => (previewMode.value === 'anonymous' ? null : user.value))
// member_team_ids: null = every team (full admin), else the teams whose private content the user may see. Unlike
// fullAdmin, anonymous (no user) is never a member.
export const teamMember = (teamId) => {
  const ids = viewer.value?.member_team_ids
  return !!viewer.value && (ids === null || !!ids?.includes(Number(teamId)))
}
// UI gate only (the server enforces scope): team_ids null = full admin, [] = no admin grant.
export const teamAdmin = (teamId) => !!user.value && (!user.value.team_ids || user.value.team_ids.includes(Number(teamId)))
// Admin preview (#468, #477): null | 'member' (hides edit controls) | 'anonymous' (also hides member-only content).
// The server still enforces scope. Admin pages keep using teamAdmin.
// ponytail: plain ref, a reload exits the preview (fails safe); sessionStorage if wanted.
export const previewMode = ref(null)
export const canEditTeam = (teamId) => !previewMode.value && teamAdmin(teamId)
export const clubAdmin = (club) => !!club && !!user.value?.clubs?.includes(club)
// UI gate for the club-management pages: a full admin or the admin of at least one club.
export const managesClubs = computed(() => fullAdmin.value || !!user.value?.clubs?.length)

const CONNECTION_ERROR = 'שגיאת התחברות, נסה שוב'

// A team or club admin only sees their own teams in admin pickers (the server enforces the real scope).
// Ordered like every team list: member teams, then admin teams, then favourites, then by name. Returns a new array.
export function ownTeams(teams) {
  const ids = user.value?.team_ids
  return byAffinity(ids ? teams.filter((t) => ids.includes(t.id)) : teams, user.value)
}

// Internal paths only: blocks open redirects through `?next=`. One leading slash (not // or /\), no control
// characters or backslashes (browsers drop tabs/newlines and read \ as /), and it must resolve to our own origin.
export const safeNext = (value) =>
  typeof value === 'string' &&
  /^\/(?![\\/])[^\u0000-\u001f\u007f\\]*$/.test(value) &&
  new URL(value, location.origin).origin === location.origin
    ? value
    : null

export function useAuth() {
  async function checkSession() {
    try {
      user.value = await apiFetch('/auth/me')
    } catch (err) {
      user.value = null
      // A 401 just means "not logged in"; only a network failure is an error.
      if (!err.status) error.value = CONNECTION_ERROR
    }
    checked.value = true
    return user.value
  }

  async function login(username, password) {
    try {
      user.value = await apiFetch('/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      error.value = null
    } catch (err) {
      user.value = null
      error.value = err.status ? 'שם משתמש/אימייל או סיסמה שגויים' : CONNECTION_ERROR
    }
  }

  async function logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
      user.value = null
      previewMode.value = null
    } catch {
      error.value = 'שגיאת התנתקות, נסה שוב'
    }
  }

  return { user, checked, error, checkSession, login, logout }
}
