<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { ownTeams } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import AdminTeamPicker from '../components/AdminTeamPicker.vue'
import AppIcon from '../components/AppIcon.vue'
import ImageUpload from '../components/ImageUpload.vue'
import PlayerForm from '../components/PlayerForm.vue'
import PlayerVideosEditor from '../components/PlayerVideosEditor.vue'
import SearchInput from '../components/SearchInput.vue'
import { apiFetch } from '../lib/api'
import { userLabel } from '../lib/format'
import { byRosterOrder } from '../lib/players'
import { matchesQuery } from '../lib/search'

const teams = ref([])
const players = ref([])
const loading = ref(true)
const query = ref('')
const searchInput = ref(null)
const shownPlayers = computed(() =>
  players.value.filter((p) => matchesQuery(query.value, [p.name, p.name_en, p.jersey_number])).sort(byRosterOrder),
)
const deletedPlayers = ref(null) // null = hidden
const editing = ref(null)
const formKey = ref(0) // bumped to remount PlayerForm (refill or clear)
const linkUserId = ref('')
const linkableUsers = ref([]) // null = failed to load
const links = ref({}) // player id -> linked username
const linkedUserIds = ref({}) // player id -> linked user id
const newImageUrl = ref({})
const error = ref(null)

const { selectedTeamId } = useSelectedTeam()

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

// Link data is secondary: a failure only degrades the picker, never the player list.
async function loadLinks(teamId) {
  const [users, rows] = await Promise.all([
    apiFetch(`/teams/${teamId}/players/linkable-users`).catch(() => null),
    apiFetch(`/teams/${teamId}/players/links`).catch(() => []),
  ])
  if (teamId !== selectedTeamId.value) return
  linkableUsers.value = users
  links.value = Object.fromEntries(rows.map((r) => [r.player_id, userLabel(r)]))
  linkedUserIds.value = Object.fromEntries(rows.map((r) => [r.player_id, r.user_id]))
}

async function loadPlayers() {
  query.value = ''
  deletedPlayers.value = null
  if (!selectedTeamId.value) {
    players.value = []
    loading.value = false
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const loaded = await apiFetch(`/teams/${id}/players`)
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    players.value = loaded
    await loadLinks(id)
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

onMounted(async () => {
  teams.value = ownTeams(await apiFetch('/teams'))
  await loadPlayers()
})

watch(selectedTeamId, loadPlayers)

function resetForm() {
  editing.value = null
  linkUserId.value = ''
  formKey.value++
}

const formEl = ref(null)

function startEdit(player) {
  formEl.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  editing.value = player
  linkUserId.value = linkedUserIds.value[player.id] ?? ''
  formKey.value++
}

// user_id only when changed: a failed links load must never silently unlink the player
const userIdChange = computed(() => {
  if (!editing.value) return undefined
  const was = linkedUserIds.value[editing.value.id] ?? ''
  if (String(linkUserId.value) === String(was)) return undefined
  return linkUserId.value === '' ? null : Number(linkUserId.value)
})

async function onSaved(saved) {
  error.value = null
  if (editing.value) {
    await loadLinks(selectedTeamId.value)
    const idx = players.value.findIndex((p) => p.id === saved.id)
    if (idx !== -1) players.value[idx] = saved
  } else {
    players.value.push(saved)
  }
  resetForm()
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
      <AdminTeamPicker :teams="teams" />
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <SearchInput v-if="players.length" id="player-search" ref="searchInput" v-model="query" label="חיפוש שחקן" />
        <div v-if="loading" class="space-y-2" aria-hidden="true">
          <div v-for="n in 3" :key="n" class="skeleton h-16" />
        </div>
        <p v-else-if="!players.length" class="empty-state">אין שחקנים עדיין.</p>
        <div v-else-if="shownPlayers.length" class="table-wrap">
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
              <tr v-for="player in shownPlayers" :key="player.id" class="table-body-row">
                <td data-label="מספר">
                  <span v-if="player.is_coach" class="badge-muted">מאמן</span>
                  <template v-else>{{ player.jersey_number }}</template>
                </td>
                <td data-label="שם">
                  {{ player.name }}
                  <span v-if="links[player.id]" class="badge-muted">{{ links[player.id] }}</span>
                </td>
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
                      <input v-model="newImageUrl[player.id]" type="url" placeholder="כתובת תמונה" :aria-label="`כתובת תמונה — ${player.name}`" class="field-input mt-0 w-40" />
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
        <div v-if="!loading && players.length && !shownPlayers.length" class="empty-state" aria-live="polite">
          <p>אין תוצאות עבור "{{ query.trim() }}".</p>
          <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
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

      <PlayerForm
        id="player-form"
        ref="formEl"
        :key="formKey"
        class="card scroll-mt-24 lg:sticky lg:top-20"
        :team-id="selectedTeamId"
        :player="editing"
        :user-id="userIdChange"
        @saved="onSaved"
        @cancel="resetForm"
      >
        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div v-if="editing">
          <label for="player-user" class="field-label">משתמש מקושר</label>
          <select id="player-user" v-model="linkUserId" class="field-input" :disabled="linkableUsers === null">
            <option value="">{{ linkableUsers === null ? 'שגיאה בטעינת המשתמשים' : 'ללא' }}</option>
            <option v-if="linkUserId !== '' && !(linkableUsers ?? []).some((u) => u.id === linkUserId)" :value="linkUserId">
              משתמש מקושר (#{{ linkUserId }})
            </option>
            <option v-for="u in linkableUsers ?? []" :key="u.id" :value="u.id">{{ userLabel(u) }}</option>
          </select>
        </div>

        <div v-if="editing">
          <h3 class="field-label">סרטונים</h3>
          <PlayerVideosEditor :player="editing" @change="(videos) => (editing.videos = videos)" />
        </div>
      </PlayerForm>
    </div>
    <a href="#player-form" class="fab lg:hidden" aria-label="הוספת שחקן"><AppIcon name="plus" /></a>
  </section>
</template>
