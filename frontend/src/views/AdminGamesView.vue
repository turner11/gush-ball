<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import AdminTeamPicker from '../components/AdminTeamPicker.vue'
import AppIcon from '../components/AppIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import GameForm from '../components/GameForm.vue'
import GameRow from '../components/GameRow.vue'
import GameMediaEditor from '../components/GameMediaEditor.vue'
import GameScorersEditor from '../components/GameScorersEditor.vue'
import GameStatsEditor from '../components/GameStatsEditor.vue'
import GameStatsLink from '../components/GameStatsLink.vue'
import PracticesAdmin from '../components/PracticesAdmin.vue'
import SearchInput from '../components/SearchInput.vue'
import { ownTeams } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { byDate, STATUS_LABELS } from '../lib/games'
import { matchesQuery } from '../lib/search'

const FIELD_LABELS = {
  scheduled_at: 'תאריך',
  status: 'סטטוס',
  team_score: 'תוצאה — קבוצה',
  opponent_score: 'תוצאה — יריבה',
  is_home: 'בית/חוץ',
  opponent_name: 'יריבה',
}

const teams = ref([])
const games = ref([])
const loading = ref(false)
const listError = ref(null)
const pendingGames = ref([])
const editing = ref(null)
const formKey = ref(0) // bumping it remounts GameForm: refill on edit, clear after save
const error = ref(null)
const pendingDelete = ref(null)
const statsUrl = ref('')

const { selectedTeamId } = useSelectedTeam()

const query = ref('')
const searchInput = ref(null)
const sortedGames = computed(() =>
  games.value.filter((g) => matchesQuery(query.value, [g.opponent.name, g.opponent.name_en])).sort(byDate),
)

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
const selectedTeam = computed(() => teams.value.find((t) => String(t.id) === selectedTeamId.value) ?? null)

async function loadGames() {
  query.value = ''
  if (!selectedTeamId.value) {
    games.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  listError.value = null
  try {
    const loaded = await apiFetch(`/teams/${id}/games`)
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    games.value = loaded
  } catch {
    if (id !== selectedTeamId.value) return
    games.value = [] // never leave the previous team's games editable
    listError.value = 'שגיאה בטעינת המשחקים'
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

async function loadPendingGames() {
  if (!selectedTeamId.value) {
    pendingGames.value = []
    return
  }
  const id = selectedTeamId.value
  const pending = await apiFetch(`/teams/${id}/games/pending-review`)
  if (id !== selectedTeamId.value) return
  pendingGames.value = pending
}

onMounted(async () => {
  teams.value = ownTeams(await apiFetch('/teams'))
  await loadGames()
  await loadPendingGames()
})

watch(selectedTeamId, () => {
  loadGames()
  loadPendingGames()
})

function suggestionCurrentValue(game, key) {
  return key === 'opponent_name' ? game.opponent.name : game[key]
}

// Moves a game out of the pending queue (if there) and upserts it into the live list.
function replaceGame(updated) {
  pendingGames.value = pendingGames.value.filter((g) => g.id !== updated.id)
  const idx = games.value.findIndex((g) => g.id === updated.id)
  if (idx !== -1) games.value[idx] = updated
  else games.value.push(updated)
}

function resetForm() {
  editing.value = null
  formKey.value++
}

const formEl = ref(null)

function startEdit(game) {
  formEl.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  editing.value = game
  statsUrl.value = game.stats_url ?? ''
  formKey.value++
}

function onSaved(game) {
  error.value = null
  replaceGame(game)
  resetForm()
}

async function approveGame(game) {
  error.value = null
  try {
    const approved = await apiFetch(`/teams/${selectedTeamId.value}/games/${game.id}/approve`, {
      method: 'POST',
    })
    replaceGame(approved)
  } catch {
    error.value = 'שגיאה באישור המשחק, נסו שוב'
  }
}

async function acceptSuggestion(game) {
  error.value = null
  try {
    const updated = await apiFetch(
      `/teams/${selectedTeamId.value}/games/${game.id}/suggestion/accept`,
      { method: 'POST' },
    )
    replaceGame(updated)
  } catch {
    error.value = 'שגיאה בעדכון המשחק, נסו שוב'
  }
}

async function rejectSuggestion(game) {
  error.value = null
  try {
    await apiFetch(`/teams/${selectedTeamId.value}/games/${game.id}/suggestion/reject`, {
      method: 'POST',
    })
    pendingGames.value = pendingGames.value.filter((g) => g.id !== game.id)
  } catch {
    error.value = 'שגיאה בעדכון המשחק, נסו שוב'
  }
}

async function onDelete(game) {
  pendingDelete.value = null
  error.value = null
  try {
    await apiFetch(`/teams/${selectedTeamId.value}/games/${game.id}`, { method: 'DELETE' })
    games.value = games.value.filter((g) => g.id !== game.id)
  } catch {
    error.value = 'שגיאה במחיקת המשחק, נסו שוב'
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">ניהול משחקים</h1>
      <a href="#practices" class="section-link">אימונים</a>
      <AdminTeamPicker :teams="teams" />
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="min-w-0 space-y-6">
        <section v-if="pendingGames.length" class="card space-y-3 border-warn/60">
          <h2 class="section-title">
            ממתינים לאישור <span class="badge badge-muted">{{ pendingGames.length }}</span>
          </h2>
          <ul class="divide-y divide-line">
            <li v-for="game in pendingGames" :key="game.id" class="space-y-2 py-3">
              <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <strong class="text-base">{{ game.opponent.name }}</strong>
                <span>{{ formatDateTime(game.scheduled_at) }}</span>
                <span>{{ game.is_home ? 'בית' : 'חוץ' }}</span>
                <span class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span>
                <span class="tabular-nums">{{ game.team_score ?? '-' }} : {{ game.opponent_score ?? '-' }}</span>
              </p>
              <p v-if="game.scrape_suggestion" class="text-sm">
                <span v-for="key in Object.keys(game.scrape_suggestion)" :key="key" class="me-4 inline-block">
                  {{ FIELD_LABELS[key] ?? key }}: <del>{{ suggestionCurrentValue(game, key) }}</del> →
                  <strong>{{ game.scrape_suggestion[key] }}</strong>
                </span>
              </p>
              <span class="flex flex-wrap gap-1">
                <GameStatsLink :game="game" class="btn-ghost" />
                <button type="button" class="btn-ghost" @click="startEdit(game)">עריכה</button>
                <button v-if="!game.scrape_suggestion" type="button" class="btn-ghost" @click="approveGame(game)">
                  אישור
                </button>
                <template v-else>
                  <button type="button" class="btn-ghost" @click="acceptSuggestion(game)">קבלת עדכון</button>
                  <button type="button" class="btn-danger-ghost" @click="rejectSuggestion(game)">דחייה</button>
                </template>
              </span>
            </li>
          </ul>
        </section>

        <div v-if="loading" class="space-y-3" aria-busy="true">
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
          <div class="skeleton h-16" />
        </div>
        <p v-else-if="listError" class="error-text" role="alert">{{ listError }}</p>
        <p v-else-if="!games.length" class="empty-state">אין משחקים עדיין.</p>
        <template v-else>
          <SearchInput id="game-search" ref="searchInput" v-model="query" label="חיפוש משחק לפי יריבה" />
          <div v-if="!sortedGames.length" class="empty-state" aria-live="polite">
            <p>אין תוצאות עבור "{{ query.trim() }}".</p>
            <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
          </div>
          <ol v-else class="card divide-y divide-line overflow-hidden p-0">
            <GameRow v-for="game in sortedGames" :key="game.id" :game="game" :team="selectedTeam">
              <template #actions>
                <GameStatsLink :game="game" class="btn-ghost" />
                <a
                  v-if="game.stats_url"
                  :href="game.stats_url"
                  target="_blank"
                  rel="noopener"
                  class="btn-ghost"
                  :aria-label="'גיליון הסטטיסטיקה של המשחק נגד ' + game.opponent.name + ' (נפתח בלשונית חדשה)'"
                >גיליון<AppIcon name="external" /></a>
                <button type="button" class="btn-ghost" @click="startEdit(game)">עריכה</button>
                <button type="button" class="btn-danger-ghost" @click="pendingDelete = game">מחיקה</button>
              </template>
            </GameRow>
          </ol>
        </template>
      </div>

      <div :class="!editing && 'lg:sticky lg:top-20'" class="space-y-6">
      <GameForm
        id="game-form"
        ref="formEl"
        :key="formKey"
        class="card scroll-mt-24"
        :team-id="selectedTeamId"
        :game="editing"
        :stats-url="editing ? statsUrl : null"
        @saved="onSaved"
        @cancel="resetForm"
      >
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div v-if="editing" class="space-y-2 border-t border-line pt-3">
          <h3 class="text-sm font-bold">סטטיסטיקת חמישיות</h3>
          <GameStatsEditor
            :key="editing.id"
            v-model:url="statsUrl"
            :team-id="selectedTeamId"
            :game="editing"
            @change="Object.assign(editing, $event)"
          />
        </div>
      </GameForm>
      <section v-if="editing" class="card space-y-3">
        <h2 class="section-title">קלעים</h2>
        <GameScorersEditor :key="editing.id" :team-id="selectedTeamId" :game-id="editing.id" />
      </section>
      <section v-if="editing" class="card space-y-3">
        <h2 class="section-title">מדיה</h2>
        <GameMediaEditor :key="editing.id" :team-id="selectedTeamId" :game-id="editing.id" />
      </section>
      </div>
    </div>
    <PracticesAdmin v-if="selectedTeam" :key="selectedTeam.id" :team="selectedTeam" />
    <a href="#game-form" class="fab lg:hidden" aria-label="הוספת משחק"><AppIcon name="plus" /></a>

    <ConfirmDialog
      confirm-label="מחיקה"
      :open="pendingDelete !== null"
      :message="`למחוק את המשחק נגד ${pendingDelete?.opponent.name}?`"
      @update:open="(value) => !value && (pendingDelete = null)"
      @confirm="onDelete(pendingDelete)"
    />
  </section>
</template>
