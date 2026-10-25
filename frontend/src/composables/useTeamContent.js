import { ref } from 'vue'

import { tryApiFetch } from '../lib/api'

// Generic CRUD (list/create/update/delete) for one of a team's content
// resources (links/videos/images/posts/plays), or a club's posts (owner 'clubs') — the
// resources differ only in field shape, not in how they're fetched.
export function useTeamContent(resource, owner = 'teams') {
  const error = ref(null)

  const list = (ownerId) =>
    tryApiFetch(error, 'שגיאה בטעינת התוכן, נסה שוב', `/${owner}/${ownerId}/${resource}`)

  const create = (ownerId, payload) =>
    tryApiFetch(error, 'שגיאה בהוספת התוכן, נסה שוב', `/${owner}/${ownerId}/${resource}`, {
      method: 'POST',
      body: payload,
    })

  const update = (ownerId, itemId, payload) =>
    tryApiFetch(error, 'שגיאה בעדכון התוכן, נסה שוב', `/${owner}/${ownerId}/${resource}/${itemId}`, {
      method: 'PATCH',
      body: payload,
    })

  const destroy = (ownerId, itemId) =>
    tryApiFetch(error, 'שגיאה במחיקת התוכן, נסה שוב', `/${owner}/${ownerId}/${resource}/${itemId}`, {
      method: 'DELETE',
    })

  // Only resources with a /order route (plays, posts) support this: ids = the full list in the new order.
  const reorder = (ownerId, ids) =>
    tryApiFetch(error, 'שגיאה בשינוי הסדר, נסה שוב', `/${owner}/${ownerId}/${resource}/order`, {
      method: 'PUT',
      body: ids,
    })

  return { error, list, create, update, delete: destroy, reorder }
}
