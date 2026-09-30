<script setup>
import { onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import AppIcon from '../components/AppIcon.vue'
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

const formEl = ref(null)

function startEdit(player) {
  formEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
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
    <div class="page-header">
      <h1 class="page-title">ניהול שחקנים</h1>
      <div class="w-full sm:w-64">
        <label for="team-select" class="field-label">קבוצה</label>
        <select id="team-select" v-model="selectedTeamId" class="field-input">
          <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
        </select>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr class="table-header-row">
                <th>מספר</th>
                <th>שם</th>
                <th>תמונות</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="player in players" :key="player.id" class="table-body-row">
                <td data-label="מספר">{{ player.jersey_number }}</td>
                <td data-label="שם">{{ player.name }}</td>
                <td data-label="תמונות" class="max-sm:flex-wrap">
                  <div>
                    <ul class="space-y-1">
                      <li v-for="image in player.images" :key="image.id" class="flex items-center gap-2 text-xs">
                        <img :src="image.url" alt="" class="size-10 rounded object-cover" />
                        <button type="button" class="btn-danger-ghost" :aria-label="`הסר תמונה — ${player.name}`" @click="deleteImage(player, image)">
                          הסר תמונה
                        </button>
                      </li>
                    </ul>
                    <div class="mt-1 flex gap-1">
                      <input v-model="newImageUrl[player.id]" type="url" placeholder="כתובת תמונה" class="field-input mt-0 min-h-10 w-40" />
                      <button type="button" class="btn-ghost" @click="addImage(player)">הוסף תמונה</button>
                    </div>
                    <ImageUpload @uploaded="(url) => (newImageUrl[player.id] = url)" />
                  </div>
                </td>
                <td class="justify-end">
                  <span class="inline-flex gap-1">
                    <button type="button" class="btn-ghost" @click="startEdit(player)">ערוך</button>
                    <button type="button" class="btn-danger-ghost" @click="onDelete(player)">מחק</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <button type="button" class="btn-secondary" :aria-expanded="deletedPlayers !== null" @click="toggleDeleted">שחקנים שנמחקו</button>
          <div v-if="deletedPlayers" class="table-wrap">
            <table class="mt-2 w-full text-start">
              <tbody>
                <tr v-for="player in deletedPlayers" :key="player.id" class="table-body-row">
                  <td class="py-2">{{ player.jersey_number }}</td>
                  <td class="py-2">{{ player.name }}</td>
                  <td class="py-2">
                    <button type="button" class="btn-ghost" @click="onRestore(player)">שחזר</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <form id="player-form" ref="formEl" class="card scroll-mt-24 space-y-3 lg:sticky lg:top-20" @submit.prevent="onSubmit">
        <h2 class="section-title">{{ editing ? 'עריכת שחקן' : 'הוספת שחקן' }}</h2>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

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
    </div>
    <a href="#player-form" class="fab lg:hidden" aria-label="הוספת שחקן"><AppIcon name="plus" /></a>
  </section>
</template>
