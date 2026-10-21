<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { apiFetch } from '../lib/api'

const props = defineProps({ teamId: { type: [Number, String], required: true }, gameId: { type: Number, required: true } })
const emit = defineEmits(['saved'])

const route = useRoute()
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref('')
const justSaved = ref(false)
const rows = ref([]) // { id, name, jersey_number, points: '' | number }
const teamScore = ref(null)

const filled = (r) => r.points !== '' && r.points !== null
const total = computed(() => rows.value.filter(filled).reduce((sum, r) => sum + Number(r.points), 0))

onMounted(async () => {
  try {
    const [players, game] = await Promise.all([
      apiFetch(`/teams/${props.teamId}/players`),
      apiFetch(`/teams/${props.teamId}/games/${props.gameId}`),
    ])
    const points = new Map(game.scorers.map((s) => [s.player_id, s.points]))
    const roster = players.map((p) => ({ id: p.id, name: p.name, jersey_number: p.jersey_number }))
    // a soft-deleted scorer is not in the roster; keep the row so saving does not drop their points
    const missing = game.scorers
      .filter((s) => !roster.some((p) => p.id === s.player_id))
      .map((s) => ({ id: s.player_id, name: s.name, jersey_number: s.jersey_number }))
    rows.value = [...roster, ...missing]
      .sort((a, b) => (a.jersey_number ?? Infinity) - (b.jersey_number ?? Infinity))
      .map((p) => ({ ...p, points: points.get(p.id) ?? '' }))
    teamScore.value = game.team_score
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
})

async function onSubmit() {
  saving.value = true
  saveError.value = ''
  justSaved.value = false
  try {
    const body = rows.value.filter(filled).map((r) => ({ player_id: r.id, points: Number(r.points) }))
    emit('saved', await apiFetch(`/teams/${props.teamId}/games/${props.gameId}/scorers`, { method: 'PUT', body }))
    justSaved.value = true
  } catch (e) {
    saveError.value = e.status === 422 ? 'נקודות לא תקינות (0 עד 200)' : 'שגיאה בשמירת הקלעים, נסה שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="space-y-2" aria-busy="true">
    <div class="skeleton h-11" />
    <div class="skeleton h-11" />
  </div>
  <p v-else-if="loadError" class="error-text" role="alert">שגיאה בטעינת הסגל, נסה שוב</p>
  <div v-else-if="!rows.length" class="empty-state space-y-2">
    <p>אין שחקנים בסגל.</p>
    <RouterLink :to="{ name: 'admin-players', params: { slug: route.params.slug } }" class="section-link">לניהול השחקנים</RouterLink>
  </div>
  <form v-else class="space-y-3" @submit.prevent="onSubmit">
    <ul class="divide-y divide-line">
      <li v-for="r in rows" :key="r.id" class="flex min-h-11 items-center gap-3 py-1">
        <label :for="`scorer-${r.id}`" class="flex min-w-0 flex-1 items-center gap-3">
          <span class="w-8 shrink-0 tabular-nums text-muted">{{ r.jersey_number != null ? `#${r.jersey_number}` : '' }}</span>
          <span class="min-w-0 break-words">{{ r.name }}</span>
        </label>
        <input
          :id="`scorer-${r.id}`"
          v-model="r.points"
          type="number"
          min="0"
          max="200"
          inputmode="numeric"
          class="field-input !mt-0 w-20 tabular-nums"
        />
      </li>
    </ul>
    <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
    <p aria-live="polite" class="text-sm text-muted">{{ justSaved ? 'הקלעים נשמרו' : '' }}</p>
    <div class="sticky-actions flex flex-wrap items-center justify-between gap-3">
      <p class="tabular-nums text-muted">
        סה״כ {{ total }} נק׳<template v-if="teamScore !== null"> · תוצאת הקבוצה {{ teamScore }}</template>
      </p>
      <button type="submit" class="btn-primary" :disabled="saving">שמירת קלעים</button>
    </div>
  </form>
</template>
