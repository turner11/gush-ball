<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import LineChart from '../components/LineChart.vue'
import LineupStats from '../components/LineupStats.vue'
import { previewMode, useAuth, viewer } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { byDate, gameDayLabel, liveStatsUrl, played, scoringByPlayer } from '../lib/games'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const router = useRouter()
// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId, teams } = useSelectedTeam()
// Fire and forget: the session gates the page (#249) and, for admins, shows the live stats link.
const { user, checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const players = ref([])
const games = ref([])
const scorerRows = ref([])
const canView = computed(() => !!viewer.value?.can_view_stats)
const pending = computed(() => viewer.value?.memberships?.some((m) => m.role === 'pending'))
const loading = ref(false)
const error = ref(false)

async function load() {
  if (!selectedTeamId.value || !canView.value) return
  const id = selectedTeamId.value
  loading.value = true
  error.value = false
  try {
    const loaded = await Promise.all([
      apiFetch(`/teams/${id}/players`),
      apiFetch(`/teams/${id}/games`),
      apiFetch(`/teams/${id}/games/scorers`),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    ;[players.value, games.value, scorerRows.value] = loaded
  } catch {
    if (id === selectedTeamId.value) error.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch([selectedTeamId, canView], load, { immediate: true })

// The URL (?game=) is the single source of truth for the picker.
const statsGames = computed(() =>
  games.value.filter((g) => g.has_stats).sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
)
const requestedId = computed(() => Number(route.query.game) || null)
const selectedGame = computed(() => statsGames.value.find((g) => g.id === requestedId.value) ?? null)
const liveUrl = computed(() => selectedGame.value && liveStatsUrl(selectedGame.value, previewMode.value ? null : user.value))
const fellBack = computed(() => requestedId.value && !selectedGame.value && !loading.value)

function optionLabel(g) {
  return `נגד ${g.opponent.name} · ${gameDayLabel(g.scheduled_at)}`
}

// Season charts: oldest game first, independent of the ?game= picker.
const teamName = computed(() => teams.value.find((t) => String(t.id) === String(selectedTeamId.value))?.name ?? 'הקבוצה')
const scoredGames = computed(() => games.value.filter(played).sort(byDate))
const scoreSeries = computed(() => [
  { key: 'us', name: teamName.value, values: scoredGames.value.map((g) => g.team_score), emphasis: 'primary' },
  { key: 'them', name: 'יריבות', values: scoredGames.value.map((g) => g.opponent_score), emphasis: 'secondary' },
])
const scorerGameIds = computed(() => [...new Set(scorerRows.value.map((r) => r.game_id))])
const scorerLabels = computed(() => {
  const dateOf = new Map(scorerRows.value.map((r) => [r.game_id, r.scheduled_at]))
  return scorerGameIds.value.map((id) => gameDayLabel(dateOf.get(id)))
})
const scorers = computed(() =>
  [...scoringByPlayer(scorerRows.value)].map(([id, rows]) => ({
    id,
    name: rows[0].name,
    total: rows.reduce((sum, r) => sum + r.points, 0),
    values: scorerGameIds.value.map((gid) => rows.find((r) => r.game_id === gid)?.points ?? null),
  })),
)
const chosenId = ref(null)
const highlightId = computed(
  () => (scorers.value.some((p) => p.id === chosenId.value) ? chosenId.value : [...scorers.value].sort((a, b) => b.total - a.total)[0]?.id),
)
// the highlighted line is drawn last, on top
const scorerSeries = computed(() =>
  [...scorers.value]
    .sort((a, b) => (a.id === highlightId.value) - (b.id === highlightId.value))
    .map((p) => ({ key: p.id, name: p.name, values: p.values, emphasis: p.id === highlightId.value ? 'primary' : 'muted' })),
)

const pick = (event) => router.push({ query: event.target.value ? { game: event.target.value } : {} })
</script>

<template>
  <section v-if="selectedTeamId" class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">נתונים</h1>
    </div>

    <div v-if="!checked" class="space-y-4" aria-busy="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <div v-else-if="!canView" class="card mx-auto max-w-xl space-y-3 text-center">
      <AppIcon name="chart" class="mx-auto size-8 text-muted" aria-hidden="true" />
      <template v-if="!viewer">
        <h2 class="section-title">הסטטיסטיקה זמינה לשחקני המועדון</h2>
        <p class="text-muted">התחברו עם Google ובקשו להצטרף לקבוצה. אחרי אישור המנהל תוכלו לראות את ה־+/- של כל חמישייה.</p>
        <RouterLink :to="{ name: 'admin-login', query: { next: route.fullPath } }" class="btn-primary w-full sm:w-auto">כניסה / הרשמה</RouterLink>
      </template>
      <template v-else-if="pending">
        <h2 class="section-title">הבקשה שלך ממתינה לאישור</h2>
        <p class="text-muted">הסטטיסטיקה תיפתח אחרי שהמנהל יאשר את הבקשה.</p>
        <RouterLink :to="{ name: 'join' }" class="btn-secondary w-full sm:w-auto">הבקשות שלי</RouterLink>
      </template>
      <template v-else>
        <h2 class="section-title">הצטרפו לקבוצה כדי לראות סטטיסטיקה</h2>
        <p class="text-muted">בחרו את הקבוצה שלכם ושלחו בקשה למנהל.</p>
        <RouterLink :to="{ name: 'join' }" class="btn-primary w-full sm:w-auto">בקשת הצטרפות</RouterLink>
      </template>
    </div>
    <div v-else-if="loading" class="space-y-4" aria-busy="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <LoadError v-else-if="error" message="שגיאה בטעינת הסטטיסטיקה" @retry="load" />
    <template v-else>
      <section class="space-y-4">
        <h2 class="section-title">נקודות לאורך העונה</h2>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="card space-y-3">
            <h3 class="font-bold">הקבוצה מול היריבות</h3>
            <template v-if="scoredGames.length >= 2">
              <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <li v-for="s in scoreSeries" :key="s.key" class="flex items-center gap-2">
                  <svg viewBox="0 0 24 4" class="w-6" aria-hidden="true" :class="s.emphasis === 'primary' ? 'text-team' : 'text-muted'">
                    <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" stroke-width="3" :stroke-dasharray="s.emphasis === 'primary' ? null : '5 3'" />
                  </svg>
                  {{ s.name }}
                </li>
              </ul>
              <LineChart :labels="scoredGames.map((g) => gameDayLabel(g.scheduled_at))" :series="scoreSeries" aria-label="תוצאות הקבוצה והיריבות לאורך העונה" />
            </template>
            <p v-else class="text-sm text-muted">הגרף יופיע אחרי שני משחקים עם תוצאה</p>
          </div>
          <div class="card space-y-3">
            <h3 class="font-bold">נקודות לפי שחקן</h3>
            <template v-if="scorerGameIds.length >= 2">
              <div class="w-full sm:max-w-xs">
                <label for="highlight-player" class="field-label">הדגשת שחקן</label>
                <select id="highlight-player" class="field-input" :value="highlightId" @change="chosenId = Number($event.target.value)">
                  <option v-for="p in scorers" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <LineChart :labels="scorerLabels" :series="scorerSeries" aria-label="נקודות של כל שחקן לאורך העונה" />
            </template>
            <p v-else class="text-sm text-muted">הגרף יופיע אחרי שני משחקים עם קלעים</p>
          </div>
        </div>
      </section>
      <p v-if="!statsGames.length" class="empty-state">עדיין אין נתונים לקבוצה</p>
      <template v-else>
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div class="w-full sm:max-w-sm">
          <label for="stats-game" class="field-label">משחק</label>
          <select id="stats-game" class="field-input" :value="selectedGame?.id ?? ''" @change="pick">
            <option value="">כל המשחקים</option>
            <option v-for="g in statsGames" :key="g.id" :value="g.id">{{ optionLabel(g) }}</option>
          </select>
        </div>
        <a
          v-if="liveUrl"
          :href="liveUrl"
          target="_blank"
          rel="noopener"
          class="section-link"
          :aria-label="'סטטיסטיקה חיה למשחק נגד ' + selectedGame.opponent.name + ' (נפתח בלשונית חדשה)'"
        >סטטיסטיקה חיה<AppIcon name="external" /></a>
      </div>
      <p v-if="fellBack" class="text-sm text-muted" role="status">המשחק המבוקש לא נמצא — מוצגים כל המשחקים</p>
      <p class="text-sm text-muted">{{ selectedGame ? '+/- של כל הרכב במשחק הזה' : '+/- של כל הרכב לאורך העונה, לפי נתוני המשחקים' }}</p>
      <LineupStats :team-id="Number(selectedTeamId)" :players="players" :game-id="selectedGame?.id ?? null" />
      </template>
    </template>
  </section>
</template>
