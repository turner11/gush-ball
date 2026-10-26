<script setup>
import { computed, ref, watch } from 'vue'

import LoadError from './LoadError.vue'
import ScoreChart from './ScoreChart.vue'
import { apiFetch } from '../lib/api'
import { formatAverage } from '../lib/format'
import { scoringTotals } from '../lib/games'
import { teamRows } from '../lib/standings'

const props = defineProps({
  team: { type: Object, required: true },
  opponent: { type: Object, required: true },
})

const games = ref([])
const rows = ref([])
const loading = ref(true)
const error = ref(false)

async function load() {
  const id = props.team.id
  loading.value = true
  error.value = false
  try {
    const loaded = await Promise.all([apiFetch(`/teams/${id}/games`), apiFetch('/standings')])
    if (id !== props.team.id) return
    ;[games.value, rows.value] = loaded
  } catch {
    if (id === props.team.id) error.value = true
  } finally {
    if (id === props.team.id) loading.value = false
  }
}
watch(() => props.team.id, load, { immediate: true })

const ours = computed(() => scoringTotals(games.value))
// The opponent is not a Team: its only season data is its row in our league's table (overall pair; no W/L split).
const oppRow = computed(() => {
  const league = teamRows(rows.value, props.team)[0]?.league_name
  const inLeague = rows.value.filter((r) => r.league_name === league)
  return teamRows(inLeague, { ibasketball_team_url: props.opponent.source_url, name: props.opponent.name })[0] ?? null
})
const tableRows = computed(() => {
  const { all, W, L } = ours.value
  const mine = (b, k) => formatAverage(b[k], b.n)
  const opp = (k) => (oppRow.value ? formatAverage(oppRow.value[k === 'for' ? 'points_for' : 'points_against'], oppRow.value.played) : '—')
  return [
    { label: 'נקודות זכות', n: all.n, us: mine(all, 'for'), them: opp('for') },
    { label: 'נקודות חובה', n: all.n, us: mine(all, 'against'), them: opp('against') },
    { label: 'זכות בניצחונות', n: W.n, us: mine(W, 'for'), them: '—' },
    { label: 'חובה בניצחונות', n: W.n, us: mine(W, 'against'), them: '—' },
    { label: 'זכות בהפסדים', n: L.n, us: mine(L, 'for'), them: '—' },
    { label: 'חובה בהפסדים', n: L.n, us: mine(L, 'against'), them: '—' },
  ]
})
</script>

<template>
  <section class="card space-y-4">
    <h2 class="section-title">ממוצעי נקודות</h2>
    <div v-if="loading" class="skeleton h-40" aria-busy="true" />
    <LoadError v-else-if="error" message="שגיאה בטעינת הממוצעים" @retry="load" />
    <p v-else-if="!ours.all.n" class="empty-state">עדיין אין משחקים עם תוצאה</p>
    <template v-else>
      <table class="w-full text-start">
        <caption class="sr-only">ממוצע נקודות למשחק, הקבוצה מול היריבה</caption>
        <thead>
          <tr class="table-header-row">
            <th scope="col" class="px-2 py-2 text-start"><span class="sr-only">מדד</span></th>
            <th scope="col" class="break-words px-2 py-2 text-start">{{ team.name }}</th>
            <th scope="col" class="break-words px-2 py-2 text-start">{{ opponent.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in tableRows" :key="r.label" class="table-body-row">
            <th scope="row" class="px-2 py-2 text-start font-normal text-muted">
              {{ r.label }}
            </th>
            <td class="px-2 py-2 text-lg font-black tabular-nums">{{ r.us }} <span class="text-xs font-normal text-muted">({{ r.n }} מש׳)</span></td>
            <td class="px-2 py-2 text-lg font-black tabular-nums">{{ r.them }}</td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-muted">
        {{ oppRow ? 'נתוני היריבה מטבלת הליגה; פירוט ניצחונות/הפסדים זמין לקבוצה בלבד' : 'אין נתוני טבלה ליריבה' }}
      </p>
      <div class="space-y-3">
        <h3 class="font-bold">הקבוצה מול היריבות</h3>
        <ScoreChart :games="games" :team-name="team.name" />
      </div>
    </template>
  </section>
</template>
