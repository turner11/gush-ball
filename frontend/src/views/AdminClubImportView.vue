<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import { fullAdmin } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'

const SOCIALS = [
  { key: 'facebook_url', label: 'פייסבוק' },
  { key: 'instagram_url', label: 'אינסטגרם' },
  { key: 'youtube_url', label: 'יוטיוב' },
  { key: 'tiktok_url', label: 'טיקטוק' },
  { key: 'twitter_url', label: 'טוויטר (X)' },
]

const router = useRouter()
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
const creating = ref(false)
const progress = ref(0)
const batchSize = ref(0)
const summary = ref(null)

const code = (row) => row.ibasketball_team_url.match(/\/team\/(\d+)/)?.[1] ?? row.ibasketball_team_url

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
  summary.value = null
  step.value = 'input'
}

const socialCount = (row) => SOCIALS.filter((s) => row[s.key]).length

function toPayload(row) {
  const { initialName, league_name, error, ...fields } = row // eslint-disable-line no-unused-vars
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && v !== null))
}

async function onCreate() {
  creating.value = true
  progress.value = 0
  batchSize.value = rows.value.length
  let created = 0
  const failed = []
  for (const row of [...rows.value]) {
    progress.value += 1
    try {
      await apiFetch('/teams', { method: 'POST', body: toPayload(row) })
      rows.value = rows.value.filter((r) => r !== row)
      created += 1
    } catch {
      row.error = 'שגיאה ביצירת הקבוצה — בדקו את הקישורים'
      failed.push(row)
    }
  }
  creating.value = false
  if (!failed.length) return router.push({ name: 'admin-teams' })
  summary.value = `נוצרו ${created}, נכשלו ${failed.length}`
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

        <form v-else class="space-y-4" @submit.prevent="onCreate">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="section-title">{{ total }} קבוצות חדשות נמצאו</h2>
            <button type="button" class="btn-ghost" @click="backToInput">חזרה</button>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr class="table-header-row">
                  <th>לוגו</th>
                  <th>שם</th>
                  <th>שם באנגלית</th>
                  <th>ליגה</th>
                  <th>כתובת</th>
                  <th>צבעים</th>
                  <th>רקע</th>
                  <th>רשתות חברתיות</th>
                  <th><span class="sr-only">הסרה</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.ibasketball_team_url" class="table-body-row">
                  <td data-label="לוגו" :class="{ 'max-sm:hidden': !row.logo_url }">
                    <img v-if="row.logo_url" :src="row.logo_url" alt="" class="size-10 object-contain" />
                  </td>
                  <td data-label="שם">
                    <input v-model="row.name" type="text" required class="field-input mt-0 w-full min-w-0 sm:min-w-48 font-bold" :aria-label="`שם — ${row.initialName}`" />
                  </td>
                  <td data-label="שם באנגלית">
                    <input v-model="row.name_en" type="text" dir="ltr" class="field-input mt-0 w-full min-w-0 sm:min-w-48" :aria-label="`שם באנגלית — ${row.initialName}`" />
                  </td>
                  <td data-label="ליגה">
                    <a v-if="row.ibasketball_league_url" :href="row.ibasketball_league_url" target="_blank" rel="noopener" class="underline">{{ row.league_name }}</a>
                    <span v-else-if="row.league_name" class="badge-muted">{{ row.league_name }} · לא זוהתה</span>
                    <span v-else class="badge-muted">לא זוהתה</span>
                  </td>
                  <td data-label="כתובת">
                    <span v-if="row.home_court_address">{{ row.home_court_address }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td data-label="צבעים">
                    <span class="flex items-center gap-2">
                      <input v-model="row.primary_color" type="color" class="h-11 w-16 rounded" :aria-label="`צבע ראשי — ${row.initialName}`" />
                      <input v-model="row.secondary_color" type="color" class="h-11 w-16 rounded" :aria-label="`צבע משני — ${row.initialName}`" />
                    </span>
                  </td>
                  <td data-label="רקע">
                    <select v-model="row.background" class="field-input mt-0 w-full min-w-0 sm:min-w-28" :aria-label="`רקע — ${row.initialName}`">
                      <option value="hoop-1">רקע 1</option>
                      <option value="hoop-2">רקע 2</option>
                    </select>
                  </td>
                  <td data-label="רשתות חברתיות">
                    <details class="w-full min-w-0">
                      <summary class="flex min-h-11 cursor-pointer items-center">רשתות ({{ socialCount(row) }})</summary>
                      <div class="space-y-2 pb-2">
                        <div v-for="social in SOCIALS" :key="social.key">
                          <label :for="`club-${code(row)}-${social.key}`" class="field-label">{{ social.label }}</label>
                          <input :id="`club-${code(row)}-${social.key}`" v-model="row[social.key]" type="url" dir="ltr" class="field-input mt-0 w-full min-w-0" />
                        </div>
                      </div>
                    </details>
                  </td>
                  <td>
                    <button type="button" class="btn-danger-ghost" :aria-label="`הסרה — ${row.initialName}`" @click="rows = rows.filter((r) => r !== row)">הסרה</button>
                    <p v-if="row.error" class="error-text" role="alert">{{ row.error }}</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="summary" class="error-text" role="alert">{{ summary }}</p>
          <p v-if="creating" role="status" aria-live="polite" class="text-sm text-muted">יוצרים {{ progress }}/{{ batchSize }}…</p>

          <div class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <button type="submit" :disabled="creating" class="btn-primary w-full sm:w-auto">יצירת {{ total }} קבוצות</button>
          </div>
        </form>
      </template>
    </template>
  </section>
</template>
