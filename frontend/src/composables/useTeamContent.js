import { ref } from 'vue'

// Generic CRUD (list/create/update/delete) for one of a team's content
// resources (links/videos/images/posts) — the four resources differ only in
// field shape, not in how they're fetched.
export function useTeamContent(resource) {
  const error = ref(null)

  async function list(teamId) {
    try {
      const res = await fetch(`/api/teams/${teamId}/${resource}`, { credentials: 'include' })
      if (!res.ok) {
        error.value = 'שגיאה בטעינת התוכן, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בטעינת התוכן, נסה שוב'
    }
  }

  async function create(teamId, payload) {
    try {
      const res = await fetch(`/api/teams/${teamId}/${resource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error.value = 'שגיאה בהוספת התוכן, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בהוספת התוכן, נסה שוב'
    }
  }

  async function update(teamId, itemId, payload) {
    try {
      const res = await fetch(`/api/teams/${teamId}/${resource}/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        error.value = 'שגיאה בעדכון התוכן, נסה שוב'
        return
      }
      return await res.json()
    } catch {
      error.value = 'שגיאה בעדכון התוכן, נסה שוב'
    }
  }

  async function destroy(teamId, itemId) {
    try {
      const res = await fetch(`/api/teams/${teamId}/${resource}/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        error.value = 'שגיאה במחיקת התוכן, נסה שוב'
      }
    } catch {
      error.value = 'שגיאה במחיקת התוכן, נסה שוב'
    }
  }

  return { error, list, create, update, delete: destroy }
}
