import { ref } from 'vue'

const user = ref(null)
const checked = ref(false)
const error = ref(null)

export function useAuth() {
  async function checkSession() {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    user.value = res.ok ? await res.json() : null
    checked.value = true
    return user.value
  }

  async function login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      user.value = null
      error.value = 'שם משתמש או סיסמה שגויים'
      return
    }
    user.value = await res.json()
    error.value = null
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    user.value = null
  }

  return { user, checked, error, checkSession, login, logout }
}
