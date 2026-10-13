<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import TeamBatchTable, { SOCIALS } from '../components/TeamBatchTable.vue'
import { fullAdmin } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'

const { startClubPreview, clubPreviewStatus } = useTeams()

const POLL_MS = 3000
const SCAN_ERRORS = {
  not_a_club: 'הקישור אינו דף אגודה תקין ב-ibasketball',
  unreachable: 'לא ניתן לטעון את דף האגודה מ-ibasketball, נסו שוב',
}

const step = ref('input') // 'input' | 'scanning' | 'review'
const clubUrl = ref('')
const club = ref('')
const clubOptions = ref([])
const primaryColor = ref('#000000')
const secondaryColor = ref('#000000')
const scanError = ref(null)
const rows = ref([])

let timer = null
let unmounted = false
const stopPolling = () => {
  clearInterval(timer)
  timer = null
}
onMounted(async () => {
  try {
    clubOptions.value = [...new Set((await apiFetch('/teams')).map((t) => t.club).filter(Boolean))].sort()
  } catch {
    // only a suggestion list
  }
})
onUnmounted(() => {
  unmounted = true
  stopPolling()
})

function failScan(message) {
  stopPolling()
  scanError.value = message
  step.value = 'input'
}

function showPreview(preview) {
  stopPolling()
  rows.value = preview.map((team) => ({
    ...team,
    initialName: team.name,
    name_en: '',
    club: club.value.trim(),
    primary_color: primaryColor.value,
    secondary_color: secondaryColor.value,
    background: 'hoop-1',
    admin_id: '',
    home_court_address: team.home_court_address ?? '',
    ...Object.fromEntries(SOCIALS.map((s) => [s.key, ''])),
    error: null,
  }))
  step.value = 'review'
}

async function pollScan() {
  try {
    const s = await clubPreviewStatus()
    if (unmounted || s.running) return
    if (s.rows) showPreview(s.rows)
    else failScan(SCAN_ERRORS[s.error] ?? 'הסריקה נכשלה, נסו שוב')
  } catch {
    if (!unmounted) failScan('הסריקה נכשלה, נסו שוב')
  }
}

async function onScan() {
  step.value = 'scanning'
  scanError.value = null
  try {
    await startClubPreview(clubUrl.value)
    if (unmounted) return
    timer ??= setInterval(pollScan, POLL_MS)
  } catch (err) {
    failScan(err.status === 409 ? 'סריקה אחרת כבר רצה, נסו שוב בעוד רגע' : 'הסריקה נכשלה, נסו שוב')
  }
}

function backToInput() {
  step.value = 'input'
}

function toPayload(row) {
  const { id, initialName, league_name, admin_id, error, ...fields } = row // eslint-disable-line no-unused-vars
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== null))
}

// A retry after a failed admin assignment must not create the team again.
async function createRow(row) {
  if (row.id) return row.id
  return (await apiFetch('/teams', { method: 'POST', body: toPayload(row) })).id
}

const total = computed(() => rows.value.length)
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <div>
        <p v-if="step !== 'review'" class="eyebrow">שלב {{ step === 'input' ? 1 : 2 }} מתוך 3</p>
        <p v-else class="eyebrow">שלב 3 מתוך 3</p>
        <h1 class="page-title">{{ step === 'review' ? 'בדיקה ויצירה' : 'ייבוא קבוצות מאגודה' }}</h1>
      </div>
      <RouterLink :to="{ name: 'admin-teams' }" class="section-link">→ כל הקבוצות</RouterLink>
    </div>

    <p v-if="!fullAdmin" class="empty-state">פעולה זו זמינה למנהל ראשי בלבד</p>

    <template v-else>
      <form v-if="step !== 'review'" class="card max-w-xl space-y-4" @submit.prevent="onScan">
        <h2 class="section-title">פרטי אגודה</h2>
        <div>
          <label for="club-url" class="field-label">קישור לדף האגודה ב-ibasketball</label>
          <input id="club-url" v-model="clubUrl" type="url" required dir="ltr" class="field-input" placeholder="https://ibasketball.co.il/club/…" :disabled="step === 'scanning'" />
        </div>
        <div>
          <label for="club-name" class="field-label">מועדון (אופציונלי)</label>
          <input id="club-name" v-model="club" type="text" maxlength="120" list="club-options" autocomplete="off" class="field-input" :disabled="step === 'scanning'" />
          <datalist id="club-options"><option v-for="name in clubOptions" :key="name" :value="name" /></datalist>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="club-primary-color" class="field-label">צבע ראשי</label>
            <input id="club-primary-color" v-model="primaryColor" type="color" class="mt-1 h-11 w-16 rounded" />
          </div>
          <div>
            <label for="club-secondary-color" class="field-label">צבע משני</label>
            <input id="club-secondary-color" v-model="secondaryColor" type="color" class="mt-1 h-11 w-16 rounded" />
          </div>
        </div>

        <p v-if="scanError" class="error-text" role="alert">{{ scanError }}</p>
        <button type="submit" :disabled="step === 'scanning'" class="btn-primary w-full sm:w-auto">סריקת קבוצות</button>

        <div v-if="step === 'scanning'" class="space-y-3" aria-busy="true">
          <p role="status" class="text-sm text-muted">סורקים את דף האגודה… זה עשוי לקחת כחצי דקה עד דקה</p>
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
        </div>
      </form>

      <template v-else>
        <div v-if="total === 0" class="empty-state space-y-2">
          <p>כל קבוצות האגודה כבר קיימות באתר</p>
          <p class="text-sm">להבאת משחקים ושחקנים הריצו סנכרון בעמוד הראשי</p>
          <RouterLink :to="{ name: 'admin-teams' }" class="section-link">→ כל הקבוצות</RouterLink>
        </div>

        <div v-else class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="section-title">{{ total }} קבוצות חדשות נמצאו</h2>
            <button type="button" class="btn-ghost" @click="backToInput">חזרה</button>
          </div>
          <TeamBatchTable v-model:rows="rows" :submit-label="`יצירת ${total} קבוצות`" :save="createRow" />
        </div>
      </template>
    </template>
  </section>
</template>
