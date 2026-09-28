import { ref } from 'vue'

export function useTeams() {
  const error = ref(null)

  async function list() {
    try {
      const res = await fetch('/api/teams', { credentials: 'include' })
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
      return await res.json()
    } catch {
      error.value = 'שגיאה בעדכון הקבוצה, נסה שוב'
    }
  }

  async function destroy(id) {
    try {
      await fetch(`/api/teams/${id}`, { method: 'DELETE', credentials: 'include' })
    } catch {
      error.value = 'שגיאה במחיקת הקבוצה, נסה שוב'
    }
  }

  return { error, list, create, update, delete: destroy }
}
