<script setup>
import { ref, watch } from 'vue'

import { apiFetch } from '../lib/api'
import { signed } from '../lib/format'
import PlayerCard from './PlayerCard.vue'

const props = defineProps({
  teamId: { type: Number, required: true },
  players: { type: Array, default: () => [] },
  gameId: { type: Number, default: null },
})

const SIZES = [1, 2, 3, 4, 5]
const SORTS = [
  { value: 'top', label: 'מובילים' },
  { value: 'offense', label: 'התקפה' },
  { value: 'defense', label: 'הגנה' },
]

const size = ref(5)
const sort = ref('top')
const lineups = ref([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    lineups.value = await apiFetch(`/teams/${props.teamId}/lineups?size=${size.value}&sort=${sort.value}${props.gameId ? `&game_id=${props.gameId}` : ''}`)
  } catch {
    // a stats failure must not blank the whole page
    error.value = 'שגיאה בטעינת החמישיות'
  } finally {
    loading.value = false
  }
}

watch(() => [props.teamId, props.gameId, size.value, sort.value], load, { immediate: true })

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
    </div>

    <div v-if="error" class="space-y-3">
      <p class="error-text" role="alert">{{ error }}</p>
      <button type="button" class="btn-secondary" @click="load">נסה שוב</button>
    </div>
    <div v-else-if="loading && !lineups.length" class="space-y-4" aria-busy="true">
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <!-- ponytail: top 10, add paging if asked -->
    <ul v-else-if="lineups.length" class="space-y-4">
      <li v-for="(l, i) in lineups.slice(0, 10)" :key="l.players.join('-')" class="card space-y-3">
        <p class="eyebrow">#{{ i + 1 }}</p>
        <div class="grid grid-cols-5 gap-1">
          <PlayerCard v-for="n in l.players" :key="n" :player="playerFor(n)" :jersey="n" compact />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="stat">
            <p class="stat-value" :class="l.score_diff >= 0 ? 'text-win' : 'text-loss'" dir="ltr">{{ signed(l.score_diff) }}</p>
            <p class="stat-label">+/-</p>
          </div>
          <div class="stat">
            <p class="stat-value" dir="ltr">{{ Math.round(l.minutes) }}</p>
            <p class="stat-label">דקות</p>
          </div>
          <div class="stat">
            <p class="stat-value">{{ l.offense_diff }} : {{ l.defence_diff }}</p>
            <p class="stat-label">זכות : חובה</p>
          </div>
          <div class="stat">
            <p class="stat-value" dir="ltr">{{ signed(Number(l.score_pm.toFixed(1))) }}</p>
            <p class="stat-label">לדקה</p>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="empty-state">{{ gameId ? 'אין נתוני חמישיות למשחק הזה.' : 'אין נתוני חמישיות עדיין.' }}</p>
  </div>
</template>
