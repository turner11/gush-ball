import { computed, ref } from 'vue'

import { apiFetch } from '../lib/api'

const user = ref(null)
const checked = ref(false)
const error = ref(null)
// team_ids: null = full admin, else the team ids this team/club admin may touch (server-enforced).
export const fullAdmin = computed(() => !user.value?.team_ids)
export const clubAdmin = (club) => !!club && !!user.value?.clubs?.includes(club)

const CONNECTION_ERROR = 'שגיאת התחברות, נסה שוב'

const byName = new Intl.Collator('he').compare

// A team or club admin only sees their own teams in admin pickers (the server enforces the real scope).
// Also orders: teams the user belongs to first, then alphabetical. Returns a new array.
export function ownTeams(teams) {
  const ids = user.value?.team_ids
  const mine = (user.value?.memberships ?? []).filter((m) => m.role !== 'pending')
  const isMine = (t) => mine.some((m) => m.team_id === t.id || (m.club && m.club === t.club))
  return (ids ? teams.filter((t) => ids.includes(t.id)) : [...teams]).sort(
    (a, b) => isMine(b) - isMine(a) || byName(a.name, b.name),
  )
}

// Internal paths only (a single leading slash, not // or /\): blocks open redirects through `?next=`.
export const safeNext = (value) => (typeof value === 'string' && /^\/(?![\\/])/.test(value) ? value : null)

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
    } catch {
      error.value = 'שגיאת התנתקות, נסה שוב'
    }
  }

  return { user, checked, error, checkSession, login, logout }
}
