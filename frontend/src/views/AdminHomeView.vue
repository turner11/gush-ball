<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import { useAuth } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'

const POLL_MS = 3000

const submitting = ref(false)
const running = ref(false)
const result = ref(null)
const error = ref(null)
let timer = null
let unmounted = false

function stopPolling() {
  clearInterval(timer)
  timer = null
}

const { user } = useAuth()
const fullAdmin = computed(() => !user.value?.team_id)

const KIND_OPTIONS = [
  { value: 'players', label: 'שחקנים' },
  { value: 'games', label: 'משחקים (לוח ותוצאות)' },
  { value: 'standings', label: 'טבלת ליגה' },
]
const kinds = ref(KIND_OPTIONS.map((k) => k.value))
const autoAccept = ref(true)
const teams = ref([])
const teamIds = ref([])

const resultText = computed(() =>
  [
    result.value?.standings != null && `${result.value.standings} שורות טבלה`,
    result.value?.games != null && `${result.value.games} משחקים`,
    result.value?.players != null && `${result.value.players} שחקנים`,
  ]
    .filter(Boolean)
    .join(', '),
)
const allTeamsSelected = computed(() => teamIds.value.length === teams.value.length)
const toggleAllTeams = () => {
  teamIds.value = allTeamsSelected.value ? [] : teams.value.map((t) => t.id)
}
const cannotSync = computed(
  () => submitting.value || running.value || !kinds.value.length || (fullAdmin.value && !teamIds.value.length),
)

async function refreshStatus() {
  try {
    const s = await apiFetch('/sync/status')
    if (unmounted) return
    running.value = s.running
    if (s.finished_at) result.value = s
    if (s.running) {
      timer ??= setInterval(refreshStatus, POLL_MS)
    } else {
      stopPolling()
    }
  } catch (err) {
    stopPolling()
    running.value = false
    error.value = err.message
  }
}

async function onSyncNow() {
  submitting.value = true
  result.value = null
  error.value = null
  try {
    await apiFetch('/sync/now', {
      method: 'POST',
      body: {
        kinds: kinds.value,
        auto_accept: autoAccept.value,
        ...(fullAdmin.value && { team_ids: teamIds.value }),
      },
    })
    running.value = true
    timer ??= setInterval(refreshStatus, POLL_MS)
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  refreshStatus()
  if (!fullAdmin.value) return
  const all = (await useTeams().list()) ?? []
  teams.value = all.filter((t) => t.ibasketball_team_url || t.ibasketball_league_url)
  teamIds.value = teams.value.map((t) => t.id)
})
onUnmounted(() => {
  unmounted = true
  stopPolling()
})
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">אזור ניהול</h1>
    <nav class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <RouterLink to="/admin/players" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="users" /></span>
        <span class="block font-extrabold">ניהול שחקנים</span>
        <span class="block text-sm text-muted">שחקנים ותמונות</span>
      </RouterLink>
      <RouterLink to="/admin/games" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="calendar" /></span>
        <span class="block font-extrabold">ניהול משחקים</span>
        <span class="block text-sm text-muted">לוח משחקים, תוצאות ותור אישור</span>
      </RouterLink>
      <RouterLink v-if="!user?.team_id" to="/admin/standings" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="table" /></span>
        <span class="block font-extrabold">ניהול טבלת ליגה</span>
        <span class="block text-sm text-muted">טבלת ליגה ידנית</span>
      </RouterLink>
      <RouterLink :to="{ name: 'admin-teams' }" class="card space-y-2 transition hover:border-team">
        <span class="flex size-10 items-center justify-center rounded-xl bg-sunken"><AppIcon name="shield" /></span>
        <span class="block font-extrabold">ניהול קבוצות</span>
        <span class="block text-sm text-muted">קבוצות, מיתוג ותוכן</span>
      </RouterLink>
    </nav>

    <div class="card space-y-2">
      <h2 class="section-title">סנכרון מ-ibasketball</h2>
      <fieldset class="space-y-2">
        <legend class="field-label">מה לסנכרן</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <label v-for="k in KIND_OPTIONS" :key="k.value" class="flex items-center gap-2">
            <input v-model="kinds" type="checkbox" :value="k.value" class="size-5" />
            {{ k.label }}
          </label>
        </div>
      </fieldset>
      <div v-if="kinds.includes('games')">
        <label class="flex items-center gap-2">
          <input v-model="autoAccept" type="checkbox" class="size-5" />
          אישור אוטומטי של משחקים
        </label>
        <p class="text-sm text-muted">משחקים שנערכו ידנית תמיד ימתינו לאישור</p>
      </div>
      <fieldset v-if="fullAdmin" class="space-y-2">
        <legend class="field-label">קבוצות</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <label v-for="t in teams" :key="t.id" class="flex items-center gap-2">
            <input v-model="teamIds" type="checkbox" :value="t.id" class="size-5" />
            {{ t.name }}
          </label>
        </div>
        <button type="button" class="btn-ghost" @click="toggleAllTeams">
          {{ allTeamsSelected ? 'נקה הכל' : 'בחר הכל' }}
        </button>
      </fieldset>
      <p v-else class="text-sm text-muted">הסנכרון יתבצע לקבוצה שלך בלבד</p>
      <button type="button" :disabled="cannotSync" class="btn-primary" @click="onSyncNow">
        סנכרון עכשיו
      </button>
      <p v-if="running" class="text-sm text-muted">
        הסנכרון רץ… זה עלול לקחת כמה דקות.
      </p>
      <div v-else-if="result" class="text-sm text-muted">
        <p v-if="result.failed" class="error-text">הסנכרון נכשל.</p>
        <p v-else>
          הסנכרון הסתיים: {{ resultText }}.
        </p>
        <ul v-if="result.errors.length" class="error-text list-disc ps-5">
          <li v-for="e in result.errors" :key="e">{{ e }}</li>
        </ul>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    </div>
  </section>
</template>
