import { computed, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { byAffinity } from '../lib/favorites'
import { useAuth } from './useAuth'

const { user } = useAuth()
const error = ref(null)
const pending = new Set()

const favoriteIds = computed(() => new Set(user.value?.favorite_team_ids ?? []))

function setFavorite(teamId, on) {
  const ids = (user.value.favorite_team_ids ?? []).filter((id) => id !== teamId)
  user.value.favorite_team_ids = on ? [...ids, teamId] : ids
}

// Optimistic: flip at once, roll back only this id if the server refuses (other toggles may be in flight).
async function toggle(teamId) {
  if (!user.value || pending.has(teamId)) return
  const on = !favoriteIds.value.has(teamId)
  pending.add(teamId)
  setFavorite(teamId, on)
  try {
    await apiFetch(`/me/favorites/${teamId}`, { method: on ? 'PUT' : 'DELETE' })
  } catch {
    setFavorite(teamId, !on)
    error.value = 'שגיאה בעדכון המועדפים, נסו שוב'
    setTimeout(() => (error.value = null), 5000)
  } finally {
    pending.delete(teamId)
  }
}

export function useFavorites() {
  return {
    favoriteIds,
    error,
    toggle,
    sortTeams: (teams) => byAffinity(teams, user.value),
    sortGroups: (items, teamsOf, nameOf) => byAffinity(items, user.value, teamsOf, nameOf),
  }
}
