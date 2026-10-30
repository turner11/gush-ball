<script setup>
import { computed, ref, watch } from 'vue'

import { apiFetch } from '../lib/api'
import { formatMinutes, signed } from '../lib/format'
import PlayerCard from './PlayerCard.vue'
import LoadError from './LoadError.vue'

const props = defineProps({
  teamId: { type: Number, required: true },
  players: { type: Array, default: () => [] },
  gameId: { type: Number, default: null },
})

const SIZES = [1, 2, 3, 4, 5]
// key: API field prefix (`${key}_diff` / `${key}_pm`); asc: defence ranks low-to-high, as in bbstats
const SORTS = [
  { value: 'top', label: 'מובילים', key: 'score', asc: false, pmLabel: '+/- לדקה' },
  { value: 'offense', label: 'התקפה', key: 'offense', asc: false, pmLabel: 'זכות לדקה' },
  { value: 'defense', label: 'הגנה', key: 'defence', asc: true, pmLabel: 'חובה לדקה' },
  { value: 'minutes', label: 'דקות' },
]
const MIN_MINUTES = [0, 1, 2, 5]

const size = ref(5)
const sort = ref('top')
const perMinute = ref(true)
const minMinutes = ref(1)
const lineups = ref([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    lineups.value = await apiFetch(`/teams/${props.teamId}/lineups?size=${size.value}${props.gameId ? `&game_id=${props.gameId}` : ''}`)
  } catch {
    // a stats failure must not blank the whole page
    error.value = 'שגיאה בטעינת החמישיות'
  } finally {
    loading.value = false
  }
}

watch(() => [props.teamId, props.gameId, size.value], load, { immediate: true })

const activeSort = computed(() => SORTS.find((o) => o.value === sort.value))
const rateField = computed(() => `${activeSort.value.key ?? 'score'}_pm`)

// Sorting and filtering are client-side: the API returns every lineup, so no refetch is needed.
const shown = computed(() => {
  const { key, asc } = activeSort.value
  // whole seconds, so a 0.99999 min stint (shown as 01:00) passes the 01:00 filter
  const kept = lineups.value.filter((l) => Math.round(l.minutes * 60) >= minMinutes.value * 60)
  const field = `${key}_${perMinute.value ? 'pm' : 'diff'}`
  const by = key ? (l) => l[field] * (asc ? -1 : 1) : (l) => l.minutes
  return kept.sort((a, b) => by(b) - by(a)).slice(0, 10)
})

const playerFor = (n) => props.players.find((p) => p.jersey_number === n)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-3">
      <div>
        <p class="eyebrow mb-1">גודל הרכב</p>
        <div role="group" aria-label="גודל הרכב" class="segmented">
          <button
            v-for="s in SIZES"
            :key="s"
            type="button"
            class="segmented-item"
            :aria-pressed="size === s"
            @click="size = s"
          >
            {{ s }}
          </button>
        </div>
      </div>
      <div>
        <p class="eyebrow mb-1">מיון</p>
        <div role="group" aria-label="מיון" class="segmented">
          <button
            v-for="o in SORTS"
            :key="o.value"
            type="button"
            class="segmented-item"
            :aria-pressed="sort === o.value"
            @click="sort = o.value"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
      <div v-if="sort !== 'minutes'">
        <p class="eyebrow mb-1">ערך</p>
        <div role="group" aria-label="ערך" class="segmented">
          <button type="button" class="segmented-item" :aria-pressed="perMinute" @click="perMinute = true">לדקה</button>
          <button type="button" class="segmented-item" :aria-pressed="!perMinute" @click="perMinute = false">סה״כ</button>
        </div>
      </div>
      <div>
        <p class="eyebrow mb-1">זמן מינימלי</p>
        <div role="group" aria-label="זמן מינימלי" class="segmented">
          <button
            v-for="m in MIN_MINUTES"
            :key="m"
            type="button"
            class="segmented-item"
            :dir="m ? 'ltr' : undefined"
            :aria-pressed="minMinutes === m"
            @click="minMinutes = m"
          >
            {{ m ? formatMinutes(m) : 'הכל' }}
          </button>
        </div>
      </div>
    </div>

    <LoadError v-if="error" :message="error" @retry="load" />
    <div v-else-if="loading && !lineups.length" class="space-y-4" aria-busy="true">
      <div class="skeleton h-44 md:h-32" />
      <div class="skeleton h-44 md:h-32" />
    </div>
    <!-- ponytail: top 10, add paging if asked -->
    <ul v-else-if="shown.length" class="space-y-4">
      <li v-for="(l, i) in shown" :key="l.players.join('-')" class="card flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <p class="eyebrow md:w-6 md:shrink-0">#{{ i + 1 }}</p>
        <div class="grid grid-cols-5 gap-1 md:w-80 md:shrink-0">
          <PlayerCard v-for="n in l.players" :key="n" :player="playerFor(n)" :jersey="n" compact />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-0 md:flex-1 md:grid-cols-2 xl:grid-cols-4">
          <div class="stat">
            <p class="stat-value" :class="l.score_diff >= 0 ? 'text-win' : 'text-loss'" dir="ltr">{{ signed(l.score_diff) }}</p>
            <p class="stat-label">+/-</p>
          </div>
          <div class="stat">
            <p class="stat-value" dir="ltr">{{ formatMinutes(l.minutes) }}</p>
            <p class="stat-label">דקות</p>
          </div>
          <div class="stat">
            <p class="stat-value">{{ l.offense_diff }} : {{ l.defence_diff }}</p>
            <p class="stat-label">זכות : חובה</p>
          </div>
          <div class="stat">
            <p class="stat-value" dir="ltr">{{ signed(Number(l[rateField].toFixed(1))) }}</p>
            <p class="stat-label">{{ activeSort.pmLabel ?? SORTS[0].pmLabel }}</p>
          </div>
        </div>
      </li>
    </ul>
    <div v-else-if="lineups.length" class="space-y-3">
      <p class="empty-state">אין הרכבים ששיחקו לפחות <span dir="ltr">{{ formatMinutes(minMinutes) }}</span></p>
      <button type="button" class="btn-secondary" @click="minMinutes = 0">הצגת כל ההרכבים</button>
    </div>
    <p v-else class="empty-state">{{ gameId ? 'אין נתוני חמישיות למשחק הזה.' : 'אין נתוני חמישיות עדיין.' }}</p>
  </div>
</template>
