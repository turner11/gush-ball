import { ref } from 'vue'

// Generic CRUD (list/create/delete) for one of a team's content resources
// (links/videos/images/posts) — the four resources differ only in field
// shape, not in how they're fetched.
export function useTeamContent(resource) {
  const error = ref(null)

  async function list(teamId) {
    try {
      const res = await fetch(`/api/teams/${teamId}/${resource}`, { credentials: 'include' })
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
      return await res.json()
    } catch {
      error.value = 'שגיאה בהוספת התוכן, נסה שוב'
    }
  }

  async function destroy(teamId, itemId) {
    try {
      await fetch(`/api/teams/${teamId}/${resource}/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch {
      error.value = 'שגיאה במחיקת התוכן, נסה שוב'
    }
  }

  return { error, list, create, delete: destroy }
}
