<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import ConfirmDialog from './ConfirmDialog.vue'

const requests = ref(null) // null = loading
const loadFailed = ref(false)
const busyId = ref(null)
const actionError = ref('')
const status = ref('')
const pendingReject = ref(null) // the request awaiting confirmation

async function load() {
  loadFailed.value = false
  try {
    requests.value = await apiFetch('/memberships')
  } catch {
    loadFailed.value = true
  }
}
onMounted(load)

// Runs one approve/reject call; on success the row leaves the list.
async function act(request, call, message) {
  busyId.value = request.id
  actionError.value = ''
  status.value = ''
  try {
    await call()
    requests.value = requests.value.filter((r) => r.id !== request.id)
    status.value = message
  } catch {
    actionError.value = 'שגיאה בעדכון הבקשה, נסו שוב'
  } finally {
    busyId.value = null
  }
}

const approve = (request) =>
  act(request, () => apiFetch(`/memberships/${request.id}/approve`, { method: 'POST' }), `הבקשה של ${request.username} אושרה`)

function onRejectConfirmed() {
  const request = pendingReject.value
  pendingReject.value = null
  return act(request, () => apiFetch(`/memberships/${request.id}`, { method: 'DELETE' }), `הבקשה של ${request.username} נדחתה`)
}
</script>

<template>
  <section class="card space-y-3" aria-labelledby="membership-requests-title">
    <div class="flex items-center gap-2">
      <h2 id="membership-requests-title" class="section-title">בקשות הצטרפות</h2>
      <span v-if="requests?.length" class="badge-muted">{{ requests.length }}</span>
    </div>

    <div v-if="requests === null && !loadFailed" class="space-y-2" aria-busy="true">
      <div class="skeleton h-14"></div>
      <div class="skeleton h-14"></div>
    </div>
    <div v-else-if="loadFailed" class="space-y-2">
      <p class="error-text" role="alert">שגיאה בטעינת הבקשות</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <p v-else-if="!requests.length" class="empty-state">אין בקשות ממתינות</p>
    <ul v-else class="divide-y divide-line">
      <li v-for="request in requests" :key="request.id" class="space-y-2 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
        <div class="min-w-0">
          <p class="truncate font-bold" dir="auto">{{ request.username }}</p>
          <p class="text-sm text-muted">
            {{ request.club ? `מועדון: ${request.club}` : `קבוצה: ${request.team_name}` }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            class="btn-primary"
            :disabled="busyId === request.id"
            :aria-label="`אישור הבקשה של ${request.username}`"
            @click="approve(request)"
          >אישור</button>
          <button
            type="button"
            class="btn-danger-ghost"
            :disabled="busyId === request.id"
            :aria-label="`דחיית הבקשה של ${request.username}`"
            @click="pendingReject = request"
          >דחייה</button>
        </div>
      </li>
    </ul>

    <p v-if="actionError" class="error-text" role="alert">{{ actionError }}</p>
    <p v-if="status" class="text-sm text-muted" role="status">{{ status }}</p>

    <ConfirmDialog
      :open="pendingReject !== null"
      :message="`לדחות את הבקשה של ${pendingReject?.username}?`"
      @update:open="(value) => !value && (pendingReject = null)"
      @confirm="onRejectConfirmed"
    />
  </section>
</template>
