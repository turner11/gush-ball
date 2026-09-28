<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const inputClass =
  'mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800'

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
const editing = ref(null)
const form = ref(emptyForm())
const error = ref(null)

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function loadGames() {
  if (!selectedTeamId.value) {
    games.value = []
    return
  }
  games.value = await apiFetch(`/teams/${selectedTeamId.value}/games`)
}

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await loadGames()
})

watch(selectedTeamId, loadGames)

function resetForm() {
  editing.value = null
  form.value = emptyForm()
}

function startEdit(game) {
  editing.value = game
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
      const idx = games.value.findIndex((g) => g.id === updated.id)
      if (idx !== -1) games.value[idx] = updated
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
    <h1 class="text-2xl font-bold">ניהול משחקים</h1>

    <div>
      <label for="team-select" class="block text-sm font-medium">קבוצה</label>
      <select id="team-select" v-model="selectedTeamId" :class="inputClass">
        <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
      </select>
    </div>

    <table class="w-full text-start">
      <thead>
        <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
          <th class="py-2 text-start">יריבה</th>
          <th class="py-2 text-start">תאריך</th>
          <th class="py-2 text-start">בית/חוץ</th>
          <th class="py-2 text-start">סטטוס</th>
          <th class="py-2 text-start">תוצאה</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="game in games" :key="game.id" class="border-b border-neutral-100 dark:border-neutral-800">
          <td class="py-2">{{ game.opponent.name }}</td>
          <td class="py-2">{{ game.scheduled_at }}</td>
          <td class="py-2">{{ game.is_home ? 'בית' : 'חוץ' }}</td>
          <td class="py-2">{{ game.status }}</td>
          <td class="py-2">{{ game.team_score ?? '-' }} : {{ game.opponent_score ?? '-' }}</td>
          <td class="py-2 space-x-2 space-x-reverse">
            <button type="button" class="hover:underline" @click="startEdit(game)">ערוך</button>
            <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(game)">מחק</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="font-semibold">{{ editing ? 'עריכת משחק' : 'הוספת משחק' }}</h2>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <div>
        <label for="game-opponent-name" class="block text-sm font-medium">יריבה</label>
        <input id="game-opponent-name" v-model="form.opponent_name" type="text" required :class="inputClass" />
      </div>

      <div>
        <label for="game-scheduled-at" class="block text-sm font-medium">תאריך ושעה</label>
        <input id="game-scheduled-at" v-model="form.scheduled_at" type="datetime-local" required :class="inputClass" />
      </div>

      <div class="flex items-center gap-2">
        <input id="game-is-home" v-model="form.is_home" type="checkbox" />
        <label for="game-is-home" class="text-sm font-medium">משחק בית</label>
      </div>

      <div>
        <label for="game-status" class="block text-sm font-medium">סטטוס</label>
        <select id="game-status" v-model="form.status" :class="inputClass">
          <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="flex gap-2">
        <div>
          <label for="game-team-score" class="block text-sm font-medium">תוצאה — קבוצה</label>
          <input id="game-team-score" v-model="form.team_score" type="number" :class="inputClass" />
        </div>
        <div>
          <label for="game-opponent-score" class="block text-sm font-medium">תוצאה — יריבה</label>
          <input id="game-opponent-score" v-model="form.opponent_score" type="number" :class="inputClass" />
        </div>
      </div>

      <div>
        <label for="game-description" class="block text-sm font-medium">תיאור</label>
        <textarea id="game-description" v-model="form.description" :class="inputClass"></textarea>
      </div>

      <div class="flex gap-2">
        <button type="submit" class="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
          {{ editing ? 'שמירה' : 'הוספה' }}
        </button>
        <button v-if="editing" type="button" class="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600" @click="resetForm">
          ביטול
        </button>
      </div>
    </form>
  </section>
</template>
