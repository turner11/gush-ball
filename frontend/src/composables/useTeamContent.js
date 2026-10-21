import { ref } from 'vue'

import { tryApiFetch } from '../lib/api'

// Generic CRUD (list/create/update/delete) for one of a team's content
// resources (links/videos/images/posts/plays) — the four resources differ only in
// field shape, not in how they're fetched.
export function useTeamContent(resource) {
  const error = ref(null)

  const list = (teamId) =>
    tryApiFetch(error, 'שגיאה בטעינת התוכן, נסה שוב', `/teams/${teamId}/${resource}`)

  const create = (teamId, payload) =>
    tryApiFetch(error, 'שגיאה בהוספת התוכן, נסה שוב', `/teams/${teamId}/${resource}`, {
      method: 'POST',
      body: payload,
    })

  const update = (teamId, itemId, payload) =>
    tryApiFetch(error, 'שגיאה בעדכון התוכן, נסה שוב', `/teams/${teamId}/${resource}/${itemId}`, {
      method: 'PATCH',
      body: payload,
    })

  const destroy = (teamId, itemId) =>
    tryApiFetch(error, 'שגיאה במחיקת התוכן, נסה שוב', `/teams/${teamId}/${resource}/${itemId}`, {
      method: 'DELETE',
    })

  // Only resources with a /order route (plays) support this: ids = the full list in the new order.
  const reorder = (teamId, ids) =>
    tryApiFetch(error, 'שגיאה בשינוי הסדר, נסה שוב', `/teams/${teamId}/${resource}/order`, {
      method: 'PUT',
      body: ids,
    })

  return { error, list, create, update, delete: destroy, reorder }
}
