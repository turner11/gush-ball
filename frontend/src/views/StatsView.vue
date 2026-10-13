<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import LineupStats from '../components/LineupStats.vue'
import { useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatGameDate } from '../lib/format'
import { liveStatsUrl } from '../lib/games'

const route = useRoute()
const router = useRouter()
// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()
// Fire and forget: the session gates the page (#249) and, for admins, shows the live stats link.
const { user, checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const players = ref([])
const games = ref([])
const canView = computed(() => !!user.value?.can_view_stats)
const pending = computed(() => user.value?.memberships?.some((m) => m.role === 'pending'))
const loading = ref(false)
const error = ref(false)

async function load() {
  if (!selectedTeamId.value || !canView.value) return
  const id = selectedTeamId.value
  loading.value = true
  error.value = false
  try {
    const loaded = await Promise.all([apiFetch(`/teams/${id}/players`), apiFetch(`/teams/${id}/games`)])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    ;[players.value, games.value] = loaded
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
const liveUrl = computed(() => selectedGame.value && liveStatsUrl(selectedGame.value, user.value))
const fellBack = computed(() => requestedId.value && !selectedGame.value && !loading.value)

function optionLabel(g) {
  const { day, month } = formatGameDate(g.scheduled_at)
  return `נגד ${g.opponent.name} · ${day} ${month}`
}

const pick = (event) => router.push({ query: event.target.value ? { game: event.target.value } : {} })
</script>

<template>
  <section v-if="selectedTeamId" class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">סטטיסטיקה</h1>
    </div>

    <div v-if="!checked" class="space-y-4" aria-busy="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <div v-else-if="!canView" class="card mx-auto max-w-xl space-y-3 text-center">
      <AppIcon name="chart" class="mx-auto size-8 text-muted" aria-hidden="true" />
      <template v-if="!user">
        <h2 class="section-title">הסטטיסטיקה זמינה לשחקני המועדון</h2>
        <p class="text-muted">התחברו עם Google ובקשו להצטרף לקבוצה. אחרי אישור המנהל תוכלו לראות את ה־+/- של כל חמישייה.</p>
        <RouterLink :to="{ name: 'admin-login', query: { next: route.fullPath } }" class="btn-primary w-full sm:w-auto">כניסה / הרשמה</RouterLink>
      </template>
      <template v-else-if="pending">
        <h2 class="section-title">הבקשה שלך ממתינה לאישור</h2>
        <p class="text-muted">הסטטיסטיקה תיפתח אחרי שמנהל הקבוצה יאשר את הבקשה.</p>
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
    <div v-else-if="error" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת הסטטיסטיקה</p>
      <button type="button" class="btn-secondary" @click="load">נסה שוב</button>
    </div>
    <p v-else-if="!statsGames.length" class="empty-state">עדיין אין נתונים לקבוצה</p>
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
  </section>
</template>
