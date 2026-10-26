<script setup>
import { computed, onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { userLabel } from '../lib/format'
import ConfirmDialog from './ConfirmDialog.vue'

const rows = ref(null) // null = loading; pending requests and approved members
const loadFailed = ref(false)
const busyId = ref(null)
const actionError = ref('')
const status = ref('')
const teamRequests = ref([]) // pending requests to add a new team (#351)
const pendingDelete = ref(null) // the row awaiting confirmation
const pendingApproveTeam = ref(null) // the team request awaiting the "becomes admin" confirm
const pendingReject = ref(null) // the team request awaiting rejection
const requests = computed(() => rows.value?.filter((r) => r.role === 'pending'))
const members = computed(() => rows.value?.filter((r) => r.role === 'member'))
const pendingCount = computed(() => (requests.value?.length ?? 0) + teamRequests.value.length)
const scopeLabel = (row) => (row.club ? `מועדון: ${row.club}` : `קבוצה: ${row.team_name}`)

async function load() {
  loadFailed.value = false
  try {
    const [memberships, teams] = await Promise.all([apiFetch('/memberships'), apiFetch('/team-requests')])
    rows.value = memberships
    teamRequests.value = teams
  } catch {
    loadFailed.value = true
  }
}
onMounted(load)

// Runs one call; onSuccess updates the row (approve) or drops it (remove).
async function act(request, call, message, onSuccess) {
  busyId.value = request.id
  actionError.value = ''
  status.value = ''
  try {
    await call()
    onSuccess()
    status.value = message
  } catch {
    actionError.value = 'שגיאה בעדכון הבקשה, נסו שוב'
  } finally {
    busyId.value = null
  }
}

const approve = (request) =>
  act(request, () => apiFetch(`/memberships/${request.id}/approve`, { method: 'POST' }), `הבקשה של ${userLabel(request)} אושרה`, () => {
    request.role = 'member'
  })

function onDeleteConfirmed() {
  const row = pendingDelete.value
  pendingDelete.value = null
  const message = row.role === 'pending' ? `הבקשה של ${userLabel(row)} נדחתה` : `${userLabel(row)} הוסר/ה`
  return act(row, () => apiFetch(`/memberships/${row.id}`, { method: 'DELETE' }), message, () => {
    rows.value = rows.value.filter((r) => r.id !== row.id)
  })
}

const approveTeam = (request) =>
  act(
    request,
    () => apiFetch(`/team-requests/${request.id}/approve`, { method: 'POST' }),
    `הקבוצה ${request.name} נוספה ו${userLabel(request)} מנהל/ת אותה`,
    () => dropTeamRequest(request),
  )

function onApproveTeamConfirmed() {
  const row = pendingApproveTeam.value
  pendingApproveTeam.value = null
  return approveTeam(row)
}

function onRejectConfirmed() {
  const row = pendingReject.value
  pendingReject.value = null
  return act(row, () => apiFetch(`/team-requests/${row.id}/reject`, { method: 'POST' }), `הבקשה של ${userLabel(row)} נדחתה`, () =>
    dropTeamRequest(row),
  )
}

const dropTeamRequest = (row) => {
  teamRequests.value = teamRequests.value.filter((r) => r.id !== row.id)
}

const confirmMessage = computed(() => {
  const row = pendingDelete.value
  if (!row) return ''
  return row.role === 'pending' ? `לדחות את הבקשה של ${userLabel(row)}?` : `להסיר את ${userLabel(row)} מ${scopeLabel(row)}?`
})
</script>

<template>
  <section class="card space-y-3" aria-labelledby="membership-requests-title">
    <div class="flex items-center gap-2">
      <h2 id="membership-requests-title" class="section-title">בקשות הצטרפות</h2>
      <span v-if="pendingCount" class="badge-muted">{{ pendingCount }}</span>
    </div>

    <div v-if="rows === null && !loadFailed" class="space-y-2" aria-busy="true">
      <div class="skeleton h-14"></div>
      <div class="skeleton h-14"></div>
    </div>
    <div v-else-if="loadFailed" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת הבקשות</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <p v-else-if="!pendingCount" class="empty-state">אין בקשות ממתינות</p>
    <ul v-else class="divide-y divide-line">
      <li v-for="request in teamRequests" :key="`team-${request.id}`" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
        <div class="min-w-0">
          <p class="truncate font-bold" dir="auto">{{ userLabel(request) }}</p>
          <p v-if="request.email_hint" class="truncate text-sm text-muted" dir="ltr">{{ request.email_hint }}</p>
          <span v-else class="badge badge-loss">אימייל לא מאומת</span>
          <p class="text-sm text-muted" dir="auto">קבוצה חדשה: {{ request.name }}<template v-if="request.league_name"> · {{ request.league_name }}</template></p>
          <a :href="request.ibasketball_team_url" target="_blank" rel="noopener" class="section-link">לדף הקבוצה באיגוד</a>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            class="btn-primary"
            :disabled="busyId === request.id"
            :aria-label="`אישור הבקשה של ${userLabel(request)}`"
            @click="pendingApproveTeam = request"
          >אישור</button>
          <button
            type="button"
            class="btn-danger-ghost"
            :disabled="busyId === request.id"
            :aria-label="`דחיית הבקשה של ${userLabel(request)}`"
            @click="pendingReject = request"
          >דחייה</button>
        </div>
      </li>
      <li v-for="request in requests" :key="request.id" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
        <div class="min-w-0">
          <p class="truncate font-bold" dir="auto">{{ userLabel(request) }}</p>
          <p v-if="request.email_hint" class="truncate text-sm text-muted" dir="ltr">{{ request.email_hint }}</p>
          <span v-else class="badge badge-loss">אימייל לא מאומת</span>
          <p class="text-sm text-muted">
            {{ scopeLabel(request) }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            class="btn-primary"
            :disabled="busyId === request.id"
            :aria-label="`אישור הבקשה של ${userLabel(request)}`"
            @click="approve(request)"
          >אישור</button>
          <button
            type="button"
            class="btn-danger-ghost"
            :disabled="busyId === request.id"
            :aria-label="`דחיית הבקשה של ${userLabel(request)}`"
            @click="pendingDelete = request"
          >דחייה</button>
        </div>
      </li>
    </ul>

    <details v-if="rows !== null" class="border-t border-line pt-3">
      <summary class="flex min-h-11 cursor-pointer items-center gap-2 font-bold">
        חברים מאושרים
        <span class="badge-muted">{{ members.length }}</span>
      </summary>
      <p v-if="!members.length" class="empty-state">אין חברים מאושרים</p>
      <ul v-else class="divide-y divide-line">
        <li v-for="member in members" :key="member.id" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
          <div class="min-w-0">
            <p class="truncate font-bold" dir="auto">{{ userLabel(member) }}</p>
            <p class="text-sm text-muted">{{ scopeLabel(member) }}</p>
          </div>
          <button
            type="button"
            class="btn-danger-ghost w-full sm:w-auto"
            :disabled="busyId === member.id"
            :aria-label="`הסרת ${userLabel(member)}`"
            @click="pendingDelete = member"
          >הסרה</button>
        </li>
      </ul>
    </details>

    <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
    <p v-if="status" class="text-sm text-muted" role="status">{{ status }}</p>

    <ConfirmDialog
      :confirm-label="pendingDelete?.role === 'pending' ? 'דחייה' : 'הסרה'"
      :open="pendingDelete !== null"
      :message="confirmMessage"
      @update:open="(value) => !value && (pendingDelete = null)"
      @confirm="onDeleteConfirmed"
    />
    <ConfirmDialog
      :open="pendingApproveTeam !== null"
      :danger="false"
      :message="pendingApproveTeam ? `להוסיף את ${pendingApproveTeam.name} לאתר? ${userLabel(pendingApproveTeam)} יהפוך/תהפוך למנהל/ת הקבוצה: יוכל/תוכל לערוך את דף הקבוצה ולאשר שחקנים.` : ''"
      @update:open="(value) => !value && (pendingApproveTeam = null)"
      @confirm="onApproveTeamConfirmed"
    />
    <ConfirmDialog
      confirm-label="דחייה"
      :open="pendingReject !== null"
      :message="pendingReject ? `לדחות את הבקשה של ${userLabel(pendingReject)} לקבוצה ${pendingReject.name}?` : ''"
      @update:open="(value) => !value && (pendingReject = null)"
      @confirm="onRejectConfirmed"
    />
  </section>
</template>
