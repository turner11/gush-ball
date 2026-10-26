<script setup>
import { computed } from 'vue'

import LineChart from './LineChart.vue'
import { byDate, gameDayLabel, played, result } from '../lib/games'

const props = defineProps({
  games: { type: Array, required: true },
  teamName: { type: String, required: true },
})

const scoredGames = computed(() => props.games.filter(played).sort(byDate))
const scoreSeries = computed(() => [
  { key: 'us', name: props.teamName, values: scoredGames.value.map((g) => g.team_score), emphasis: 'primary' },
  { key: 'them', name: 'יריבות', values: scoredGames.value.map((g) => g.opponent_score), emphasis: 'secondary' },
])
</script>

<template>
  <div v-if="scoredGames.length >= 2" class="space-y-3">
    <ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <li v-for="s in scoreSeries" :key="s.key" class="flex items-center gap-2">
        <svg viewBox="0 0 24 4" class="w-6" aria-hidden="true" :class="s.emphasis === 'primary' ? 'text-team' : 'text-muted'">
          <line x1="0" y1="2" x2="24" y2="2" stroke="currentColor" stroke-width="3" :stroke-dasharray="s.emphasis === 'primary' ? null : '5 3'" />
        </svg>
        {{ s.name }}
      </li>
      <li v-for="o in [{ cls: 'text-win', label: 'ניצחון' }, { cls: 'text-loss', label: 'הפסד' }]" :key="o.label" class="flex items-center gap-2">
        <svg viewBox="0 0 24 4" class="w-6" aria-hidden="true" :class="o.cls">
          <line x1="2" y1="2" x2="22" y2="2" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity="0.5" />
        </svg>
        {{ o.label }}
      </li>
    </ul>
    <LineChart
      :labels="scoredGames.map((g) => gameDayLabel(g.scheduled_at))"
      :series="scoreSeries"
      :outcomes="scoredGames.map(result)"
      aria-label="תוצאות הקבוצה והיריבות לאורך העונה"
    />
  </div>
  <p v-else class="text-sm text-muted">הגרף יופיע אחרי שני משחקים עם תוצאה</p>
</template>
