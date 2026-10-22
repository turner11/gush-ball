<script setup>
import { computed, nextTick, ref, watch } from 'vue'

import { canEditTeam } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import AppIcon from '../components/AppIcon.vue'
import PlayerCard from '../components/PlayerCard.vue'
import PlayerForm from '../components/PlayerForm.vue'
import { apiFetch } from '../lib/api'
import { byRosterOrder } from '../lib/players'

const players = ref([])
// coaches lead the API order; a heading only appears when there are two groups
const groups = computed(() =>
  [
    { title: 'מאמנים', people: players.value.filter((p) => p.is_coach) },
    { title: 'שחקנים', people: players.value.filter((p) => !p.is_coach) },
  ].filter((g) => g.people.length),
)
const teamImages = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

// Inline add/edit for team admins (#471): null = closed, 'new' = add form, a player id = that player's editor.
const canEdit = computed(() => !!selectedTeamId.value && canEditTeam(selectedTeamId.value))
const editingId = ref(null)
const addToggle = ref(null)
watch(canEdit, (can) => {
  if (!can) editingId.value = null
})

async function closeEditor() {
  const id = editingId.value
  editingId.value = null
  await nextTick()
  // looked up after the re-render: toggling מאמן moves the card to the other group and remounts it
  const opener = id === 'new' ? addToggle.value : document.getElementById('edit-player-' + id)
  opener?.focus()
}

function onSaved(saved) {
  const idx = players.value.findIndex((p) => p.id === saved.id)
  if (idx === -1) players.value.push(saved)
  else players.value[idx] = saved
  players.value.sort(byRosterOrder)
  closeEditor()
}

async function loadPlayers() {
  editingId.value = null
  if (!selectedTeamId.value) {
    players.value = []
    teamImages.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    // images only decorate the card slideshow: a failed call must not blank the roster
    const [loaded, images] = await Promise.all([
      apiFetch(`/teams/${id}/players`),
      apiFetch(`/teams/${id}/images`).catch(() => []),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    players.value = loaded
    teamImages.value = images
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, loadPlayers, { immediate: true })
</script>

<template>
  <section class="space-y-10 sm:space-y-14">
    <div class="page-header">
      <h1 class="page-title">שחקנים</h1>
      <button
        v-if="canEdit"
        ref="addToggle"
        type="button"
        class="btn-secondary gap-2"
        aria-controls="add-player-form"
        :aria-expanded="editingId === 'new'"
        @click="editingId = editingId === 'new' ? null : 'new'"
      >
        <template v-if="editingId === 'new'">סגירה</template>
        <template v-else><AppIcon name="plus" />הוספת שחקן</template>
      </button>
    </div>

    <PlayerForm v-if="editingId === 'new'" id="add-player-form" class="card max-w-xl" :team-id="selectedTeamId" @saved="onSaved" />

    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true">
      <div v-for="n in 5" :key="n" class="skeleton h-40" />
    </div>
    <template v-else-if="groups.length">
      <div v-for="group in groups" :key="group.title" class="space-y-4">
        <h2 v-if="groups.length > 1" class="section-title">{{ group.title }}</h2>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          <template v-for="player in group.people" :key="player.id">
          <li class="card p-4 relative overflow-hidden">
            <PlayerCard :player="player" :team-images="teamImages" />
            <!-- a sibling of the card link, and `relative` so it paints above the hover slideshow -->
            <button
              v-if="canEdit"
              :id="'edit-player-' + player.id"
              type="button"
              class="btn-ghost relative mt-2 w-full justify-center"
              :aria-label="'עריכת ' + player.name"
              :aria-expanded="editingId === player.id"
              :aria-controls="'player-editor-' + player.id"
              @click="editingId = editingId === player.id ? null : player.id"
            >
              עריכה
            </button>
          </li>
          <li v-if="editingId === player.id" :id="'player-editor-' + player.id" class="col-span-full">
            <PlayerForm class="card max-w-xl" :team-id="selectedTeamId" :player="player" @saved="onSaved" @cancel="closeEditor" />
          </li>
          </template>
        </ul>
      </div>
    </template>
    <p v-else class="empty-state">אין שחקנים עדיין.</p>
  </section>
</template>
