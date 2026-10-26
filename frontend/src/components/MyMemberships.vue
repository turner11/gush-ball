<script setup>
import { computed, ref } from 'vue'

import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps({
  teams: { type: Array, default: null }, // null = still loading; only used for names
  title: { type: String, default: 'הבקשות שלי' },
})

const { user, checkSession } = useAuth()

const memberships = computed(() => user.value?.memberships ?? [])
const teamRequests = computed(() => user.value?.team_requests ?? [])
const teamName = (id) => props.teams?.find((t) => t.id === id)?.name ?? '…'
const rowName = (m) => (m.club ? `מועדון ${m.club}` : teamName(m.team_id))

const BADGES = {
  pending: { text: 'ממתין לאישור', cls: 'badge-muted' },
  member: { text: 'חבר', cls: 'badge-win' },
  admin: { text: 'מנהל', cls: 'badge-win' },
}
const REQUEST_BADGES = {
  pending: BADGES.pending,
  approved: { text: 'אושרה', cls: 'badge-win' },
  rejected: { text: 'נדחתה', cls: 'badge-loss' },
}
const LEAVE_LABEL = { pending: 'ביטול בקשה', member: 'עזיבה' }

const pendingLeave = ref(null)
const busyId = ref(null)
const error = ref('')

async function onLeaveConfirmed() {
  const { id } = pendingLeave.value
  pendingLeave.value = null
  busyId.value = id
  error.value = ''
  try {
    await apiFetch(`/memberships/mine/${id}`, { method: 'DELETE' })
    await checkSession() // user.memberships stays the single source of truth
  } catch {
    error.value = 'שגיאה, נסו שוב'
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="card space-y-3">
    <h2 class="section-title">{{ title }}</h2>
    <ul v-if="memberships.length || teamRequests.length" class="divide-y divide-line">
      <li v-for="m in memberships" :key="m.id" class="py-2">
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate font-bold" dir="auto">{{ rowName(m) }}</span>
          <span class="flex shrink-0 items-center gap-2">
            <span :class="BADGES[m.role].cls">{{ BADGES[m.role].text }}</span>
            <!-- admin grants can't be left here: the server 404s them -->
            <button
              v-if="LEAVE_LABEL[m.role]"
              type="button"
              class="btn-danger-ghost"
              :disabled="busyId === m.id"
              :aria-label="`${LEAVE_LABEL[m.role]}: ${rowName(m)}`"
              @click="pendingLeave = m"
            >
              {{ LEAVE_LABEL[m.role] }}
            </button>
          </span>
        </div>
        <p v-if="m.role === 'pending'" class="text-sm text-muted">
          {{ m.club ? 'מנהל האתר יאשר את הבקשה' : 'מנהל הקבוצה יאשר את הבקשה' }}
        </p>
      </li>
      <li v-for="r in teamRequests" :key="`team-${r.id}`" class="py-2">
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate font-bold" dir="auto">בקשה להוספת {{ r.name }}</span>
          <span :class="REQUEST_BADGES[r.status].cls">{{ REQUEST_BADGES[r.status].text }}</span>
        </div>
        <p v-if="r.status === 'pending'" class="text-sm text-muted">מנהל יאשר את הבקשה</p>
      </li>
    </ul>
    <p v-else class="empty-state">
      אין חברויות עדיין.
      <RouterLink to="/join" class="section-link">הצטרפות לקבוצה</RouterLink>
    </p>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <RouterLink v-if="user?.can_view_stats" to="/stats" class="btn-primary w-full sm:w-auto">צפייה בסטטיסטיקה</RouterLink>

    <ConfirmDialog
      :confirm-label="pendingLeave ? LEAVE_LABEL[pendingLeave.role] : undefined"
      :open="pendingLeave !== null"
      :message="pendingLeave ? (pendingLeave.role === 'pending' ? `לבטל את הבקשה ל${rowName(pendingLeave)}?` : `לעזוב את ${rowName(pendingLeave)}?`) : ''"
      @update:open="(v) => { if (!v) pendingLeave = null }"
      @confirm="onLeaveConfirmed"
    />
  </div>
</template>
