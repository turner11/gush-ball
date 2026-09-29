<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import ImageUpload from '../components/ImageUpload.vue'
import { apiFetch } from '../lib/api'

const teams = ref([])
const players = ref([])
const deletedPlayers = ref(null) // null = hidden
const editing = ref(null)
const form = ref({ name: '', name_en: '', jersey_number: '' })
const newImageUrl = ref({})
const error = ref(null)

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function loadPlayers() {
  deletedPlayers.value = null
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

  error.value = null
  try {
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
  } catch {
    error.value = 'שגיאה בשמירת השחקן, נסה שוב'
  }
}

async function onDelete(player) {
  error.value = null
  try {
    await apiFetch(`/teams/${selectedTeamId.value}/players/${player.id}`, { method: 'DELETE' })
    players.value = players.value.filter((p) => p.id !== player.id)
  } catch {
    error.value = 'שגיאה במחיקת השחקן, נסה שוב'
  }
}

async function toggleDeleted() {
  if (deletedPlayers.value) {
    deletedPlayers.value = null
    return
  }
  error.value = null
  try {
    deletedPlayers.value = await apiFetch(`/teams/${selectedTeamId.value}/players/deleted`)
  } catch {
    error.value = 'שגיאה בטעינת השחקנים שנמחקו, נסה שוב'
  }
}

async function onRestore(player) {
  error.value = null
  try {
    const restored = await apiFetch(`/teams/${selectedTeamId.value}/players/${player.id}/restore`, {
      method: 'POST',
    })
    deletedPlayers.value = deletedPlayers.value.filter((p) => p.id !== player.id)
    players.value.push(restored)
  } catch {
    error.value = 'שגיאה בשחזור השחקן, נסה שוב'
  }
}

async function addImage(player) {
  const url = newImageUrl.value[player.id]
  if (!url) return
  error.value = null
  try {
    const image = await apiFetch(`/players/${player.id}/images`, { method: 'POST', body: { url } })
    player.images.push(image)
    newImageUrl.value[player.id] = ''
  } catch {
    error.value = 'שגיאה בהוספת תמונה, נסה שוב'
  }
}

async function deleteImage(player, image) {
  error.value = null
  try {
    await apiFetch(`/players/${player.id}/images/${image.id}`, { method: 'DELETE' })
    player.images = player.images.filter((i) => i.id !== image.id)
  } catch {
    error.value = 'שגיאה במחיקת התמונה, נסה שוב'
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">ניהול שחקנים</h1>

    <div>
      <label for="team-select" class="field-label">קבוצה</label>
      <select id="team-select" v-model="selectedTeamId" class="field-input">
        <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
      </select>
    </div>

    <table class="w-full text-start">
      <thead>
        <tr class="table-header-row">
          <th class="py-2 text-start">מספר</th>
          <th class="py-2 text-start">שם</th>
          <th class="py-2 text-start">תמונות</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="player in players" :key="player.id" class="table-row">
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
            <ImageUpload @uploaded="(url) => (newImageUrl[player.id] = url)" />
          </td>
          <td class="py-2">
            <span class="inline-flex gap-2">
              <button type="button" class="hover:underline" @click="startEdit(player)">ערוך</button>
              <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(player)">מחק</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <div>
      <button type="button" class="btn-secondary" @click="toggleDeleted">שחקנים שנמחקו</button>
      <table v-if="deletedPlayers" class="mt-2 w-full text-start">
        <tbody>
          <tr v-for="player in deletedPlayers" :key="player.id" class="table-row">
            <td class="py-2">{{ player.jersey_number }}</td>
            <td class="py-2">{{ player.name }}</td>
            <td class="py-2">
              <button type="button" class="hover:underline" @click="onRestore(player)">שחזר</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="section-title">{{ editing ? 'עריכת שחקן' : 'הוספת שחקן' }}</h2>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <div>
        <label for="player-name" class="field-label">שם</label>
        <input id="player-name" v-model="form.name" type="text" required class="field-input" />
      </div>

      <div>
        <label for="player-name-en" class="field-label">שם באנגלית</label>
        <input id="player-name-en" v-model="form.name_en" type="text" class="field-input" />
      </div>

      <div>
        <label for="player-jersey-number" class="field-label">מספר חולצה</label>
        <input id="player-jersey-number" v-model="form.jersey_number" type="number" class="field-input" />
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
