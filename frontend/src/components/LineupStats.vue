<script setup>
import { ref, watch } from 'vue'

import { apiFetch } from '../lib/api'
import PlayerCard from './PlayerCard.vue'

const props = defineProps({
  teamId: { type: Number, required: true },
  players: { type: Array, default: () => [] },
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
    lineups.value = await apiFetch(`/teams/${props.teamId}/lineups?size=${size.value}&sort=${sort.value}`)
  } catch {
    // a stats failure must not blank the whole roster page
    error.value = 'שגיאה בטעינת החמישיות'
  } finally {
    loading.value = false
  }
}

watch(() => [props.teamId, size.value, sort.value], load, { immediate: true })

const playerFor = (n) => props.players.find((p) => p.jersey_number === n)
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:gap-6">
      <div>
        <p class="mb-1 text-xs text-neutral-500">גודל הרכב</p>
        <div role="group" aria-label="גודל הרכב" class="inline-flex gap-1 rounded-lg border border-neutral-300 p-1 dark:border-neutral-600">
          <button
            v-for="s in SIZES"
            :key="s"
            type="button"
            :class="size === s ? 'btn-primary' : 'btn-ghost min-h-10 sm:min-h-9'"
            :aria-pressed="size === s"
            @click="size = s"
          >
            {{ s }}
          </button>
        </div>
      </div>
      <div>
        <p class="mb-1 text-xs text-neutral-500">מיון</p>
        <div role="group" aria-label="מיון" class="inline-flex gap-1 rounded-lg border border-neutral-300 p-1 dark:border-neutral-600">
          <button
            v-for="o in SORTS"
            :key="o.value"
            type="button"
            :class="sort === o.value ? 'btn-primary' : 'btn-ghost min-h-10 sm:min-h-9'"
            :aria-pressed="sort === o.value"
            @click="sort = o.value"
          >
            {{ o.label }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div v-else-if="loading && !lineups.length" class="space-y-4" aria-busy="true">
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <!-- ponytail: top 10, add paging if asked -->
    <ul v-else-if="lineups.length" class="space-y-4">
      <li v-for="l in lineups.slice(0, 10)" :key="l.players.join('-')" class="card space-y-3 p-4">
        <div class="grid grid-cols-5 gap-1">
          <PlayerCard v-for="n in l.players" :key="n" :player="playerFor(n)" :jersey="n" />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-neutral-100 p-2 text-center dark:bg-neutral-700/50">
            <p class="text-xl font-bold tabular-nums" :class="l.score_diff >= 0 ? 'text-green-600' : 'text-red-600'" dir="ltr">{{ signed(l.score_diff) }}</p>
            <p class="text-xs text-neutral-500">+/-</p>
          </div>
          <div class="rounded-lg bg-neutral-100 p-2 text-center dark:bg-neutral-700/50">
            <p class="text-xl font-bold tabular-nums" dir="ltr">{{ Math.round(l.minutes) }}</p>
            <p class="text-xs text-neutral-500">דקות</p>
          </div>
          <div class="rounded-lg bg-neutral-100 p-2 text-center dark:bg-neutral-700/50">
            <p class="text-xl font-bold tabular-nums" dir="ltr">{{ l.offense_diff }} : {{ l.defence_diff }}</p>
            <p class="text-xs text-neutral-500">זכות : חובה</p>
          </div>
          <div class="rounded-lg bg-neutral-100 p-2 text-center dark:bg-neutral-700/50">
            <p class="text-xl font-bold tabular-nums" dir="ltr">{{ signed(Number(l.score_pm.toFixed(1))) }}</p>
            <p class="text-xs text-neutral-500">לדקה</p>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="empty-state">אין נתוני חמישיות עדיין.</p>
  </div>
</template>
