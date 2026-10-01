<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import AppIcon from '../components/AppIcon.vue'
import GameStatsLink from '../components/GameStatsLink.vue'
import { ownTeams, useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { sheetCopyUrl, STATUS_LABELS } from '../lib/games'

const STATUSES = Object.keys(STATUS_LABELS)

const FIELD_LABELS = {
  scheduled_at: 'תאריך',
  status: 'סטטוס',
  team_score: 'תוצאה — קבוצה',
  opponent_score: 'תוצאה — יריבה',
  is_home: 'בית/חוץ',
  opponent_name: 'יריבה',
}

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
const { user } = useAuth()
const statsUrl = ref('')
const statsMessage = ref(null)
const confirming = ref(null) // null | 'replace' | 'delete'
const CONFIRMS = {
  replace: { text: 'למשחק זה כבר יש נתונים. לטעון מחדש ולהחליף אותם?', button: 'החלף', cls: 'btn-primary' },
  delete: { text: 'למחוק את כל נתוני הסטטיסטיקה של המשחק? הקישור לגיליון יישמר.', button: 'מחק', cls: 'btn-danger' },
}
const templateCopyUrl = computed(() => sheetCopyUrl(user.value?.stats_template_url ?? ''))
const loadButton = ref(null)

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
  teams.value = ownTeams(await apiFetch('/teams'))
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

function requestLoadStats() {
  if (editing.value.has_stats) {
    confirming.value = 'replace'
    return
  }
  loadStats()
}

function confirmStats() {
  const action = confirming.value
  cancelConfirm()
  if (action === 'delete') deleteStats()
  else loadStats()
}

function cancelConfirm() {
  confirming.value = null
  loadButton.value?.focus()
}

async function deleteStats() {
  error.value = null
  statsMessage.value = null
  try {
    await apiFetch(`/teams/${selectedTeamId.value}/games/${editing.value.id}/stats`, { method: 'DELETE' })
    editing.value.has_stats = false
    statsMessage.value = 'הסטטיסטיקה נמחקה'
  } catch (e) {
    error.value = e.message
  }
}

async function loadStats() {
  error.value = null
  statsMessage.value = null
  try {
    const res = await apiFetch(`/teams/${selectedTeamId.value}/games/${editing.value.id}/stats`, {
      method: 'POST',
      body: { url: statsUrl.value || null },
    })
    editing.value.has_stats = res.snapshots > 0
    editing.value.stats_url = res.stats_url
    statsMessage.value = res.snapshots ? `נטענו ${res.snapshots} רשומות` : 'הקישור נשמר — הגיליון עדיין ריק. טענו שוב אחרי המשחק.'
  } catch (e) {
    error.value = e.message
  }
}

function resetForm() {
  confirming.value = null
  editing.value = null
  form.value = emptyForm()
}

const formEl = ref(null)

function startEdit(game) {
  formEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  editing.value = game
  confirming.value = null
  statsMessage.value = null
  statsUrl.value = game.stats_url ?? ''
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
    <div class="page-header">
      <h1 class="page-title">ניהול משחקים</h1>
      <div class="w-full sm:w-64">
        <label for="team-select" class="field-label">קבוצה</label>
        <select id="team-select" v-model="selectedTeamId" class="field-input">
          <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
        </select>
      </div>
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
                <button type="button" class="btn-ghost" @click="startEdit(game)">ערוך</button>
                <button v-if="!game.scrape_suggestion" type="button" class="btn-ghost" @click="approveGame(game)">
                  אשר
                </button>
                <template v-else>
                  <button type="button" class="btn-ghost" @click="acceptSuggestion(game)">קבל עדכון</button>
                  <button type="button" class="btn-danger-ghost" @click="rejectSuggestion(game)">דחה</button>
                </template>
              </span>
            </li>
          </ul>
        </section>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr class="table-header-row">
                <th>יריבה</th>
                <th>תאריך</th>
                <th>בית/חוץ</th>
                <th>סטטוס</th>
                <th>תוצאה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="game in games" :key="game.id" class="table-body-row">
                <td data-label="יריבה">{{ game.opponent.name }}</td>
                <td data-label="תאריך">{{ formatDateTime(game.scheduled_at) }}</td>
                <td data-label="בית/חוץ">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
                <td data-label="סטטוס"><span class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span></td>
                <td data-label="תוצאה" class="tabular-nums">{{ game.team_score ?? '-' }} : {{ game.opponent_score ?? '-' }}</td>
                <td class="justify-end">
                  <span class="inline-flex gap-1">
                    <GameStatsLink :game="game" class="btn-ghost" />
                    <button type="button" class="btn-ghost" @click="startEdit(game)">ערוך</button>
                    <button type="button" class="btn-danger-ghost" @click="onDelete(game)">מחק</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <form id="game-form" ref="formEl" class="card scroll-mt-24 space-y-3 lg:sticky lg:top-20" @submit.prevent="onSubmit">
        <h2 class="section-title">{{ editing ? 'עריכת משחק' : 'הוספת משחק' }}</h2>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div>
          <label for="game-opponent-name" class="field-label">יריבה</label>
          <input id="game-opponent-name" v-model="form.opponent_name" type="text" required class="field-input" />
        </div>

        <div>
          <label for="game-scheduled-at" class="field-label">תאריך ושעה</label>
          <input id="game-scheduled-at" v-model="form.scheduled_at" type="datetime-local" required class="field-input" />
        </div>

        <div class="flex items-center gap-2">
          <input id="game-is-home" v-model="form.is_home" type="checkbox" class="size-5" />
          <label for="game-is-home" class="field-label">משחק בית</label>
        </div>

        <div>
          <label for="game-status" class="field-label">סטטוס</label>
          <select id="game-status" v-model="form.status" class="field-input">
            <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-2">
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

        <div v-if="editing" class="space-y-2 border-t border-line pt-3">
          <h3 class="text-sm font-bold">סטטיסטיקת חמישיות</h3>
          <label for="stats-url" class="field-label">קישור או מזהה של הגיליון (משותף ל"כל מי שיש לו קישור")</label>
          <input id="stats-url" v-model="statsUrl" type="text" inputmode="url" dir="ltr" autocomplete="off" spellcheck="false" class="field-input" />
          <a v-if="templateCopyUrl" :href="templateCopyUrl" target="_blank" rel="noopener" class="section-link">גיליון חדש מתבנית<AppIcon name="external" /></a>
          <p v-if="templateCopyUrl" class="text-sm text-muted">לפני המשחק: צרו גיליון מהתבנית, הדביקו את הקישור ולחצו טען. אחרי המשחק: טענו שוב.</p>
          <div class="flex flex-wrap gap-2">
            <button ref="loadButton" type="button" class="btn-secondary" @click="requestLoadStats">טען סטטיסטיקה</button>
            <button v-if="editing.has_stats" type="button" class="btn-danger-ghost" @click="confirming = 'delete'">מחק סטטיסטיקה</button>
          </div>
          <div v-if="confirming" role="alert" class="space-y-2 rounded-xl border border-warn/60 p-3">
            <p class="text-sm">{{ CONFIRMS[confirming].text }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="CONFIRMS[confirming].cls" @click="confirmStats">{{ CONFIRMS[confirming].button }}</button>
              <button type="button" class="btn-secondary" @click="cancelConfirm">ביטול</button>
            </div>
          </div>
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
    </div>
    <a href="#game-form" class="fab lg:hidden" aria-label="הוספת משחק"><AppIcon name="plus" /></a>
  </section>
</template>
