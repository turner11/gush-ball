import { computed, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { fullAdmin, useAuth } from './useAuth'

// Join/new-team requests the signed-in team or club admin may approve; shown as a badge on the admin entry points.
export const pendingRequestCount = ref(0)
// The only place the "full admins never get the badge" rule lives (fullAdmin is also true when signed out).
export const pendingBadge = computed(() => (fullAdmin.value ? 0 : pendingRequestCount.value))
export const pendingLabel = computed(() => {
  const n = pendingBadge.value
  return n === 0 ? '' : n === 1 ? 'בקשה ממתינה אחת' : `${n} בקשות ממתינות`
})

export async function loadPendingRequestCount() {
  const { user } = useAuth()
  if (!user.value?.is_admin || fullAdmin.value) {
    pendingRequestCount.value = 0
    return
  }
  try {
    // ponytail: counts full lists (already scope-filtered); add a count endpoint if they get large.
    const [memberships, teamRequests] = await Promise.all([apiFetch('/memberships'), apiFetch('/team-requests')])
    pendingRequestCount.value = memberships.filter((m) => m.role === 'pending').length + teamRequests.length
  } catch {
    // keep the last count: the badge is a hint, the admin home shows the real error
  }
}
