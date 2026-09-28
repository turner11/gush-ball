import { ref } from 'vue'

export function useTeams() {
  const error = ref(null)

  async function get(id) {
    try {
      const res = await fetch(`/api/teams/${id}`, { credentials: 'include' })
      if (!res.ok) {
        error.value =
          res.status === 404 ? 'הקבוצה לא נמצאה' : 'שגיאה בטעינת הקבוצה, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בטעינת הקבוצה, נסה שוב'
    }
  }

  async function list() {
    try {
      const res = await fetch('/api/teams', { credentials: 'include' })
      if (!res.ok) {
        error.value = 'שגיאה בטעינת הקבוצות, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בטעינת הקבוצות, נסה שוב'
    }
  }

  async function create(payload) {
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error.value = 'שגיאה ביצירת הקבוצה, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה ביצירת הקבוצה, נסה שוב'
    }
  }

  async function update(id, payload) {
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error.value = 'שגיאה בעדכון הקבוצה, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בעדכון הקבוצה, נסה שוב'
    }
  }

  async function destroy(id) {
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        error.value = 'שגיאה במחיקת הקבוצה, נסה שוב'
      }
    } catch {
      error.value = 'שגיאה במחיקת הקבוצה, נסה שוב'
    }
  }

  return { error, get, list, create, update, delete: destroy }
}
