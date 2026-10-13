import { ref } from 'vue'

import { apiFetch, tryApiFetch } from '../lib/api'

export function useTeams() {
  const error = ref(null)

  async function get(id) {
    try {
      return await apiFetch(`/teams/${id}`)
    } catch (err) {
      error.value = err.status === 404 ? 'הקבוצה לא נמצאה' : 'שגיאה בטעינת הקבוצה, נסה שוב'
    }
  }

  const list = () => tryApiFetch(error, 'שגיאה בטעינת הקבוצות, נסה שוב', '/teams')

  const create = (payload) =>
    tryApiFetch(error, 'שגיאה ביצירת הקבוצה, נסה שוב', '/teams', { method: 'POST', body: payload })

  // Throws (unlike the rest) so the club-import view can tell a 422 from other failures.
  const previewClub = (clubUrl) =>
    apiFetch('/teams/club-preview', { method: 'POST', body: { club_url: clubUrl } })

  const update = (id, payload) =>
    tryApiFetch(error, 'שגיאה בעדכון הקבוצה, נסה שוב', `/teams/${id}`, {
      method: 'PATCH',
      body: payload,
    })

  const destroy = (id) =>
    tryApiFetch(error, 'שגיאה במחיקת הקבוצה, נסה שוב', `/teams/${id}`, { method: 'DELETE' })

  return { error, get, list, create, previewClub, update, delete: destroy }
}
