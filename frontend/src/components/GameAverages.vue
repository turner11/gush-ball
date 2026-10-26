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
  gameId: { type: Number, required: true },
})

const games = ref([])
const rows = ref([])
const oppResults = ref([])
const oppFailed = ref(false)
const oppLoading = ref(true)
const loading = ref(true)
const error = ref(false)

async function load() {
  const { id } = props.team
  const gameId = props.gameId
  const current = () => id === props.team.id && gameId === props.gameId
  loading.value = true
  oppLoading.value = true
  error.value = false
  // The opponent's results come from ibasketball and can be slow: they load outside the gate, so only the split waits,
  // and a failure there only dashes it; it never fails the widget.
  apiFetch(`/teams/${id}/games/${gameId}/opponent-results`)
    .then((r) => [r, false], () => [[], true])
    .then(([r, failed]) => {
      if (!current()) return
      oppResults.value = r
      oppFailed.value = failed
      oppLoading.value = false
    })
  try {
    const loaded = await Promise.all([apiFetch(`/teams/${id}/games`), apiFetch('/standings')])
    if (!current()) return
    ;[games.value, rows.value] = loaded
  } catch {
    if (current()) error.value = true
  } finally {
    if (current()) loading.value = false
  }
}
watch(() => [props.team.id, props.gameId], load, { immediate: true })

const ours = computed(() => scoringTotals(games.value))
const theirs = computed(() => scoringTotals(oppResults.value))
// The opponent is not a Team: its overall pair is its row in our league's table; its W/L split comes from its league results.
const oppRow = computed(() => {
  const league = teamRows(rows.value, props.team)[0]?.league_name
  const inLeague = rows.value.filter((r) => r.league_name === league)
  return teamRows(inLeague, { ibasketball_team_url: props.opponent.source_url, name: props.opponent.name })[0] ?? null
})
const tableRows = computed(() => {
  const { all, W, L } = ours.value
  const avg = (b, k) => formatAverage(b[k], b.n)
  const split = (b, k) => (oppLoading.value ? '…' : formatAverage(b[k], b.n))
  const opp = (k) => (oppRow.value ? formatAverage(oppRow.value[k === 'for' ? 'points_for' : 'points_against'], oppRow.value.played) : '—')
  return [
    { label: 'נקודות זכות', n: all.n, us: avg(all, 'for'), them: opp('for') },
    { label: 'נקודות חובה', n: all.n, us: avg(all, 'against'), them: opp('against') },
    { label: 'זכות בניצחונות', n: W.n, us: avg(W, 'for'), them: split(theirs.value.W, 'for'), themN: theirs.value.W.n },
    { label: 'חובה בניצחונות', n: W.n, us: avg(W, 'against'), them: split(theirs.value.W, 'against'), themN: theirs.value.W.n },
    { label: 'זכות בהפסדים', n: L.n, us: avg(L, 'for'), them: split(theirs.value.L, 'for'), themN: theirs.value.L.n },
    { label: 'חובה בהפסדים', n: L.n, us: avg(L, 'against'), them: split(theirs.value.L, 'against'), themN: theirs.value.L.n },
  ]
})

const footnote = computed(() => {
  if (oppFailed.value) return 'פירוט ניצחונות/הפסדים של היריבה לא זמין כרגע'
  if (oppRow.value || oppResults.value.length) return 'נתוני היריבה מטבלת הליגה ומתוצאות משחקיה בליגה'
  return 'אין נתוני טבלה ליריבה'
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
            <td class="px-2 py-2 text-lg font-black tabular-nums">
              {{ r.them }} <span v-if="r.themN" class="text-xs font-normal text-muted">({{ r.themN }} מש׳)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-muted">
        {{ footnote }}
      </p>
      <div class="space-y-3">
        <h3 class="font-bold">הקבוצה מול היריבות</h3>
        <ScoreChart :games="games" :team-name="team.name" />
      </div>
    </template>
  </section>
</template>
