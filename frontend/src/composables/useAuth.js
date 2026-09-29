import { ref } from 'vue'

import { apiFetch } from '../lib/api'

const user = ref(null)
const checked = ref(false)
const error = ref(null)

const CONNECTION_ERROR = 'שגיאת התחברות, נסה שוב'

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
      error.value = err.status ? 'שם משתמש או סיסמה שגויים' : CONNECTION_ERROR
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
