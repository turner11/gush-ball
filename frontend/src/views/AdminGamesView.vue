<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const STATUSES = ['scheduled', 'final', 'postponed', 'cancelled']

function emptyForm() {
  return {
    opponent_name: '',
    scheduled_at: '',
    is_home: true,
    status: 'scheduled',
    team_score: '',
    opponent_score: '',
    description: '',
  }
}

const teams = ref([])
const games = ref([])
const pendingGames = ref([])
const editing = ref(null)
const form = ref(emptyForm())
const error = ref(null)
const statsUrl = ref('')
const statsMessage = ref(null)

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function loadGames() {
  if (!selectedTeamId.value) {
    games.value = []
    return
  }
  games.value = await apiFetch(`/teams/${selectedTeamId.value}/games`)
}

async function loadPendingGames() {
  if (!selectedTeamId.value) {
    pendingGames.value = []
    return
  }
  pendingGames.value = await apiFetch(`/teams/${selectedTeamId.value}/games/pending-review`)
}

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
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

async function loadStats() {
  error.value = null
  statsMessage.value = null
  try {
    const res = await apiFetch(`/teams/${selectedTeamId.value}/games/${editing.value.id}/stats`, {
      method: 'POST',
      body: { url: statsUrl.value || null },
    })
    statsMessage.value = `נטענו ${res.snapshots} רשומות`
  } catch (e) {
    error.value = e.message
  }
}

function resetForm() {
  editing.value = null
  form.value = emptyForm()
}

function startEdit(game) {
  editing.value = game
  statsMessage.value = null
  form.value = {
    opponent_name: game.opponent.name,
    scheduled_at: game.scheduled_at.slice(0, 16),
    is_home: game.is_home,
    status: game.status,
    team_score: game.team_score ?? '',
    opponent_score: game.opponent_score ?? '',
    description: game.description ?? '',
  }
}

async function onSubmit() {
  const payload = {
    opponent_name: form.value.opponent_name,
    scheduled_at: form.value.scheduled_at,
    is_home: form.value.is_home,
    status: form.value.status,
    team_score: form.value.team_score === '' ? null : Number(form.value.team_score),
    opponent_score: form.value.opponent_score === '' ? null : Number(form.value.opponent_score),
    description: form.value.description || null,
  }

  error.value = null
  try {
    if (editing.value) {
      const updated = await apiFetch(`/teams/${selectedTeamId.value}/games/${editing.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
      replaceGame(updated)
    } else {
      const created = await apiFetch(`/teams/${selectedTeamId.value}/games`, {
        method: 'POST',
        body: payload,
      })
      games.value.push(created)
    }

    resetForm()
  } catch {
    error.value = 'שגיאה בשמירת המשחק, נסה שוב'
  }
}

async function approveGame(game) {
  error.value = null
  try {
    const approved = await apiFetch(`/teams/${selectedTeamId.value}/games/${game.id}/approve`, {
      method: 'POST',
    })
    replaceGame(approved)
  } catch {
    error.value = 'שגיאה באישור המשחק, נסה שוב'
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
    error.value = 'שגיאה בעדכון המשחק, נסה שוב'
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
    error.value = 'שגיאה בעדכון המשחק, נסה שוב'
  }
}

async function onDelete(game) {
  error.value = null
  try {
    await apiFetch(`/teams/${selectedTeamId.value}/games/${game.id}`, { method: 'DELETE' })
    games.value = games.value.filter((g) => g.id !== game.id)
  } catch {
    error.value = 'שגיאה במחיקת המשחק, נסה שוב'
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">ניהול משחקים</h1>

    <div>
      <label for="team-select" class="field-label">קבוצה</label>
      <select id="team-select" v-model="selectedTeamId" class="field-input">
        <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
      </select>
    </div>

    <div v-if="pendingGames.length">
      <h2 class="section-title">ממתינים לאישור</h2>
      <table class="w-full text-start">
        <thead>
          <tr class="table-header-row">
            <th class="py-2 text-start">יריבה</th>
            <th class="py-2 text-start">תאריך</th>
            <th class="py-2 text-start">בית/חוץ</th>
            <th class="py-2 text-start">סטטוס</th>
            <th class="py-2 text-start">תוצאה</th>
            <th class="py-2 text-start"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="game in pendingGames" :key="game.id">
            <tr class="table-row">
              <td class="py-2">{{ game.opponent.name }}</td>
              <td class="py-2">{{ game.scheduled_at }}</td>
              <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
              <td class="py-2">{{ game.status }}</td>
              <td class="py-2">{{ game.team_score ?? '-' }} : {{ game.opponent_score ?? '-' }}</td>
              <td class="py-2">
                <span class="inline-flex gap-2">
                  <button type="button" class="hover:underline" @click="startEdit(game)">ערוך</button>
                  <button
                    v-if="!game.scrape_suggestion"
                    type="button"
                    class="hover:underline"
                    @click="approveGame(game)"
                  >
                    אשר
                  </button>
                  <template v-else>
                    <button type="button" class="hover:underline" @click="acceptSuggestion(game)">
                      קבל עדכון
                    </button>
                    <button type="button" class="hover:underline" @click="rejectSuggestion(game)">
                      דחה
                    </button>
                  </template>
                </span>
              </td>
            </tr>
            <tr v-if="game.scrape_suggestion" class="table-row text-sm opacity-80">
              <td class="py-1" colspan="6">
                <span
                  v-for="key in Object.keys(game.scrape_suggestion)"
                  :key="key"
                  class="me-4"
                >
                  {{ key }}: {{ suggestionCurrentValue(game, key) }} → {{ game.scrape_suggestion[key] }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <table class="w-full text-start">
      <thead>
        <tr class="table-header-row">
          <th class="py-2 text-start">יריבה</th>
          <th class="py-2 text-start">תאריך</th>
          <th class="py-2 text-start">בית/חוץ</th>
          <th class="py-2 text-start">סטטוס</th>
          <th class="py-2 text-start">תוצאה</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="game in games" :key="game.id" class="table-row">
          <td class="py-2">{{ game.opponent.name }}</td>
          <td class="py-2">{{ game.scheduled_at }}</td>
          <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
          <td class="py-2">{{ game.status }}</td>
          <td class="py-2">{{ game.team_score ?? '-' }} : {{ game.opponent_score ?? '-' }}</td>
          <td class="py-2">
            <span class="inline-flex gap-2">
              <button type="button" class="hover:underline" @click="startEdit(game)">ערוך</button>
              <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(game)">מחק</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="section-title">{{ editing ? 'עריכת משחק' : 'הוספת משחק' }}</h2>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <div>
        <label for="game-opponent-name" class="field-label">יריבה</label>
        <input id="game-opponent-name" v-model="form.opponent_name" type="text" required class="field-input" />
      </div>

      <div>
        <label for="game-scheduled-at" class="field-label">תאריך ושעה</label>
        <input id="game-scheduled-at" v-model="form.scheduled_at" type="datetime-local" required class="field-input" />
      </div>

      <div class="flex items-center gap-2">
        <input id="game-is-home" v-model="form.is_home" type="checkbox" />
        <label for="game-is-home" class="field-label">משחק בית</label>
      </div>

      <div>
        <label for="game-status" class="field-label">סטטוס</label>
        <select id="game-status" v-model="form.status" class="field-input">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="flex gap-2">
        <div>
          <label for="game-team-score" class="field-label">תוצאה — קבוצה</label>
          <input id="game-team-score" v-model="form.team_score" type="number" class="field-input" />
        </div>
        <div>
          <label for="game-opponent-score" class="field-label">תוצאה — יריבה</label>
          <input id="game-opponent-score" v-model="form.opponent_score" type="number" class="field-input" />
        </div>
      </div>

      <div>
        <label for="game-description" class="field-label">תיאור</label>
        <textarea id="game-description" v-model="form.description" class="field-input"></textarea>
      </div>

      <div v-if="editing">
        <label for="stats-url" class="field-label">קישור לסטטיסטיקה (גיליון שמשותף ל"כל מי שיש לו קישור")</label>
        <input id="stats-url" v-model="statsUrl" type="url" class="field-input" />
        <button type="button" class="btn-secondary mt-2" @click="loadStats">טען סטטיסטיקה</button>
        <p v-if="statsMessage" class="text-sm">{{ statsMessage }}</p>
      </div>

      <div class="flex gap-2">
        <button type="submit" class="btn-primary">
          {{ editing ? 'שמירה' : 'הוספה' }}
        </button>
        <button v-if="editing" type="button" class="btn-secondary" @click="resetForm">
          ביטול
        </button>
      </div>
    </form>
  </section>
</template>
