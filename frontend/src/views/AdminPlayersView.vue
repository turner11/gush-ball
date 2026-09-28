<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const inputClass =
  'mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800'

const teams = ref([])
const players = ref([])
const editing = ref(null)
const form = ref({ name: '', name_en: '', jersey_number: '' })
const newImageUrl = ref({})

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function loadPlayers() {
  if (!selectedTeamId.value) {
    players.value = []
    return
  }
  players.value = await apiFetch(`/teams/${selectedTeamId.value}/players`)
}

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await loadPlayers()
})

watch(selectedTeamId, loadPlayers)

function resetForm() {
  editing.value = null
  form.value = { name: '', name_en: '', jersey_number: '' }
}

function startEdit(player) {
  editing.value = player
  form.value = {
    name: player.name,
    name_en: player.name_en ?? '',
    jersey_number: player.jersey_number ?? '',
  }
}

async function onSubmit() {
  const payload = {
    name: form.value.name,
    name_en: form.value.name_en || null,
    jersey_number: form.value.jersey_number === '' ? null : Number(form.value.jersey_number),
  }

  if (editing.value) {
    const updated = await apiFetch(`/teams/${selectedTeamId.value}/players/${editing.value.id}`, {
      method: 'PATCH',
      body: payload,
    })
    const idx = players.value.findIndex((p) => p.id === updated.id)
    if (idx !== -1) players.value[idx] = updated
  } else {
    const created = await apiFetch(`/teams/${selectedTeamId.value}/players`, {
      method: 'POST',
      body: payload,
    })
    players.value.push(created)
  }

  resetForm()
}

async function onDelete(player) {
  await apiFetch(`/teams/${selectedTeamId.value}/players/${player.id}`, { method: 'DELETE' })
  players.value = players.value.filter((p) => p.id !== player.id)
}

async function addImage(player) {
  const url = newImageUrl.value[player.id]
  if (!url) return
  const image = await apiFetch(`/players/${player.id}/images`, { method: 'POST', body: { url } })
  player.images.push(image)
  newImageUrl.value[player.id] = ''
}

async function deleteImage(player, image) {
  await apiFetch(`/players/${player.id}/images/${image.id}`, { method: 'DELETE' })
  player.images = player.images.filter((i) => i.id !== image.id)
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-bold">ניהול שחקנים</h1>

    <div>
      <label for="team-select" class="block text-sm font-medium">קבוצה</label>
      <select id="team-select" v-model="selectedTeamId" :class="inputClass">
        <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
      </select>
    </div>

    <table class="w-full text-start">
      <thead>
        <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
          <th class="py-2 text-start">מספר</th>
          <th class="py-2 text-start">שם</th>
          <th class="py-2 text-start">תמונות</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="player in players" :key="player.id" class="border-b border-neutral-100 dark:border-neutral-800">
          <td class="py-2">{{ player.jersey_number }}</td>
          <td class="py-2">{{ player.name }}</td>
          <td class="py-2">
            <ul class="space-y-1">
              <li v-for="image in player.images" :key="image.id" class="flex items-center gap-2 text-xs">
                <span class="truncate">{{ image.url }}</span>
                <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="deleteImage(player, image)">
                  הסר תמונה
                </button>
              </li>
            </ul>
            <div class="mt-1 flex gap-1">
              <input v-model="newImageUrl[player.id]" type="url" placeholder="כתובת תמונה" class="w-40 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-800" />
              <button type="button" class="text-xs hover:underline" @click="addImage(player)">הוסף תמונה</button>
            </div>
          </td>
          <td class="py-2 space-x-2 space-x-reverse">
            <button type="button" class="hover:underline" @click="startEdit(player)">ערוך</button>
            <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(player)">מחק</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="font-semibold">{{ editing ? 'עריכת שחקן' : 'הוספת שחקן' }}</h2>

      <div>
        <label for="player-name" class="block text-sm font-medium">שם</label>
        <input id="player-name" v-model="form.name" type="text" required :class="inputClass" />
      </div>

      <div>
        <label for="player-name-en" class="block text-sm font-medium">שם באנגלית</label>
        <input id="player-name-en" v-model="form.name_en" type="text" :class="inputClass" />
      </div>

      <div>
        <label for="player-jersey-number" class="block text-sm font-medium">מספר חולצה</label>
        <input id="player-jersey-number" v-model="form.jersey_number" type="number" :class="inputClass" />
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
