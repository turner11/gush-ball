import { ref } from 'vue'

import { apiFetch, tryApiFetch } from '../lib/api'

export function useTeams() {
  const error = ref(null)

  async function get(id) {
    try {
      return await apiFetch(`/teams/${id}`)
    } catch (err) {
      error.value = err.status === 404 ? 'הקבוצה לא נמצאה' : 'שגיאה בטעינת הקבוצה, נסו שוב'
    }
  }

  const list = () => tryApiFetch(error, 'שגיאה בטעינת הקבוצות, נסו שוב', '/teams')

  const create = (payload) =>
    tryApiFetch(error, 'שגיאה ביצירת הקבוצה, נסו שוב', '/teams', { method: 'POST', body: payload })

  // These throw (unlike the rest) so the club-import view can tell failures apart.
  const startClubPreview = (clubUrl) =>
    apiFetch('/teams/club-preview', { method: 'POST', body: { club_url: clubUrl } })
  const clubPreviewStatus = () => apiFetch('/teams/club-preview/status')

  const update = (id, payload) =>
    tryApiFetch(error, 'שגיאה בעדכון הקבוצה, נסו שוב', `/teams/${id}`, {
      method: 'PATCH',
      body: payload,
    })

  const destroy = (id) =>
    tryApiFetch(error, 'שגיאה במחיקת הקבוצה, נסו שוב', `/teams/${id}`, { method: 'DELETE' })

  return { error, get, list, create, startClubPreview, clubPreviewStatus, update, delete: destroy }
}
