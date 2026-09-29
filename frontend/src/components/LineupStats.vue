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

async function load() {
  lineups.value = await apiFetch(`/teams/${props.teamId}/lineups?size=${size.value}&sort=${sort.value}`)
}

watch(() => [props.teamId, size.value, sort.value], load, { immediate: true })

const playerFor = (n) => props.players.find((p) => p.jersey_number === n)
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap gap-4">
      <div role="group" class="flex gap-1">
        <button
          v-for="s in SIZES"
          :key="s"
          type="button"
          :class="size === s ? 'btn-primary' : 'btn-secondary'"
          :aria-pressed="size === s"
          @click="size = s"
        >
          {{ s }}
        </button>
      </div>
      <div role="group" class="flex gap-1">
        <button
          v-for="o in SORTS"
          :key="o.value"
          type="button"
          :class="sort === o.value ? 'btn-primary' : 'btn-secondary'"
          :aria-pressed="sort === o.value"
          @click="sort = o.value"
        >
          {{ o.label }}
        </button>
      </div>
    </div>

    <!-- ponytail: top 10, add paging if asked -->
    <ul v-if="lineups.length" class="space-y-4">
      <li v-for="l in lineups.slice(0, 10)" :key="l.players.join('-')" class="card space-y-3 p-4">
        <div class="flex flex-wrap gap-4">
          <PlayerCard v-for="n in l.players" :key="n" :player="playerFor(n)" :jersey="n" />
        </div>
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span
            class="text-3xl font-bold"
            :class="l.score_diff >= 0 ? 'text-green-600' : 'text-red-600'"
            dir="ltr"
          >
            {{ signed(l.score_diff) }}
          </span>
          <span>{{ Math.round(l.minutes) }} דק'</span>
          <span dir="ltr">{{ l.offense_diff }} : {{ l.defence_diff }}</span>
          <span dir="ltr">{{ signed(Number(l.score_pm.toFixed(1))) }} / דקה</span>
        </div>
      </li>
    </ul>
    <p v-else class="empty-state">אין נתוני חמישיות עדיין.</p>
  </div>
</template>
