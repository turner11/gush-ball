<script setup>
import { computed, nextTick, ref, watch } from 'vue'

import AppIcon from '../components/AppIcon.vue'
import CalendarSubscribe from '../components/CalendarSubscribe.vue'
import GameForm from '../components/GameForm.vue'
import GameRow from '../components/GameRow.vue'
import GameStatsLink from '../components/GameStatsLink.vue'
import LoadError from '../components/LoadError.vue'
import PracticesAdmin from '../components/PracticesAdmin.vue'
import PracticeRow from '../components/PracticeRow.vue'
import { canEditTeam, teamMember, useAuth, viewer } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { isPast, splitGames } from '../lib/games'

// Fire and forget: the live stats link appears for admins once the session resolves.
const { checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const games = ref([])
const practices = ref([])
const practicesError = ref(false)
const practicesLoading = ref(false)
const PRACTICE_DAYS = 14 // a season of weekly practices must not bury the games; the calendar feed carries them all
const team = ref(null)
const loading = ref(false)
const loadError = ref(false)

// Inline add/edit (#471): editingId is null, 'new' or a game id, so one form is open at a time.
const canEdit = computed(() => !!team.value && canEditTeam(team.value.id))
const editingId = ref(null)
const addToggle = ref(null)
watch(canEdit, (can) => {
  if (!can) editingId.value = null
})

async function closeEditor() {
  const openerId = editingId.value
  editingId.value = null
  await nextTick()
  // Looked up after the re-render: a game that moved sections was re-mounted, so an earlier element is detached.
  const opener = openerId === 'new' ? addToggle.value : document.getElementById('edit-game-' + openerId)
  opener?.focus()
}

function onSaved(game) {
  const idx = games.value.findIndex((g) => g.id === game.id)
  if (idx === -1) games.value.push(game)
  else games.value[idx] = game
  expanded.value[isPast(game) ? 'past' : 'upcoming'] = true // never hide a game the admin just saved behind the fold
  closeEditor()
}

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

const RESULTS_SHOWN = 3
const UPCOMING_SHOWN = 1 // reads as "next game"
const expanded = ref({ past: false, upcoming: false })

// Results first. Collapsed, a section shows its top rows plus one faded, inert peek row hinting at more.
const sections = computed(() => {
  const { upcoming, past } = splitGames(games.value)
  return [
    { key: 'past', title: 'תוצאות', games: past, limit: RESULTS_SHOWN, empty: 'אין תוצאות עדיין.', all: 'כל התוצאות' },
    { key: 'upcoming', title: 'המשחק הבא', games: upcoming, limit: UPCOMING_SHOWN, empty: 'אין משחקים קרובים.', all: 'כל המשחקים הקרובים' },
  ].map((s) => {
    const open = expanded.value[s.key]
    return {
      ...s,
      shown: open ? s.games : s.games.slice(0, s.limit),
      peek: open ? null : (s.games[s.limit] ?? null),
      foldable: s.games.length > s.limit,
    }
  })
})

function toggleSection(s) {
  expanded.value[s.key] = !expanded.value[s.key]
  if (!expanded.value[s.key] && s.games.slice(s.limit).some((g) => g.id === editingId.value)) editingId.value = null
}

async function loadGames() {
  editingId.value = null
  expanded.value = { past: false, upcoming: false }
  loadError.value = false
  if (!selectedTeamId.value) {
    games.value = []
    team.value = null
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const [loadedTeam, loadedGames] = await Promise.all([apiFetch(`/teams/${id}`), apiFetch(`/teams/${id}/games`)])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    team.value = loadedTeam
    games.value = loadedGames
  } catch {
    if (id === selectedTeamId.value) {
      loadError.value = true
      team.value = null // don't leave the previous team's name and actions on screen
    }
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, loadGames, { immediate: true })

// Team-private (#440): only members ask, so fans never see a request or a 403.
const upcomingPractices = computed(() => {
  const now = Date.now()
  const horizon = now + PRACTICE_DAYS * 86400000
  return practices.value.filter((p) => {
    const at = new Date(p.starts_at).getTime()
    return at >= now && at <= horizon
  })
})
const isMember = computed(() => checked.value && !!team.value && teamMember(team.value.id))

async function loadPractices() {
  practices.value = []
  practicesError.value = false
  const id = selectedTeamId.value
  if (!id || !checked.value || !teamMember(id)) return
  practicesLoading.value = true
  try {
    const loaded = await apiFetch(`/teams/${id}/practices`)
    if (id === selectedTeamId.value) practices.value = loaded // else a newer team was selected meanwhile
  } catch {
    if (id === selectedTeamId.value) practicesError.value = true
  } finally {
    if (id === selectedTeamId.value) practicesLoading.value = false
  }
}

watch([selectedTeamId, checked, viewer], loadPractices, { immediate: true })

// Practice add/edit/cancel/delete reuse the admin component behind a toggle; closing reloads the read-only list.
const { editing: editingPractices, toggleEl: practicesToggle, toggle: togglePractices } = useInlineEditor(canEdit, loadPractices)
</script>

<template>
  <section class="space-y-10 sm:space-y-14">
    <div class="page-header">
      <div>
        <p class="eyebrow">{{ team?.name }}</p>
        <h1 class="page-title">לוח משחקים</h1>
        <a v-if="team?.ibasketball_team_url" :href="team.ibasketball_team_url" target="_blank" rel="noopener noreferrer" aria-label="דף הקבוצה באיגוד (נפתח בלשונית חדשה)" class="section-link">דף הקבוצה באיגוד<AppIcon name="external" /></a>
      </div>
      <div v-if="team" class="flex flex-wrap items-center gap-2">
        <button
          v-if="canEdit"
          ref="addToggle"
          type="button"
          class="btn-secondary"
          aria-controls="add-game-form"
          :aria-expanded="editingId === 'new'"
          @click="editingId = editingId === 'new' ? null : 'new'"
        >
          <template v-if="editingId === 'new'">סגירה</template>
          <template v-else><AppIcon name="plus" />הוספת משחק</template>
        </button>
        <CalendarSubscribe :team-id="team.id" :practices="isMember" />
      </div>
    </div>

    <GameForm v-if="editingId === 'new'" id="add-game-form" class="card max-w-2xl" :team-id="team.id" @saved="onSaved" @cancel="closeEditor" />

    <section v-if="isMember" class="space-y-3">
      <div class="section-header">
        <h2 v-if="!editingPractices" class="section-title">אימונים קרובים</h2>
        <button
          v-if="canEdit"
          ref="practicesToggle"
          type="button"
          class="btn-secondary ms-auto"
          aria-controls="practices"
          :aria-expanded="editingPractices"
          @click="togglePractices"
        >{{ editingPractices ? 'סיום עריכה' : 'עריכת אימונים' }}</button>
      </div>
      <PracticesAdmin v-if="editingPractices" :key="team.id" :team="team" />
      <template v-else>
        <div v-if="practicesLoading" class="space-y-3" aria-busy="true">
          <div class="skeleton h-12" />
          <div class="skeleton h-12" />
        </div>
        <p v-else-if="practicesError" class="error-text" role="alert">שגיאה בטעינת האימונים</p>
        <ol v-else-if="upcomingPractices.length" class="card divide-y divide-line overflow-hidden p-0">
          <PracticeRow v-for="practice in upcomingPractices" :key="practice.id" :practice="practice" />
        </ol>
        <p v-else class="empty-state">אין אימונים בשבועיים הקרובים</p>
      </template>
    </section>

    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>

    <LoadError v-else-if="loadError" message="שגיאה בטעינת המשחקים" @retry="loadGames" />

    <p v-else-if="!games.length" class="empty-state">אין משחקים עדיין.</p>

    <template v-else>
      <section v-for="s in sections" :key="s.key" class="space-y-3">
        <h2 class="section-title">{{ s.title }}</h2>
        <ol v-if="s.games.length" :id="'games-' + s.key" class="card divide-y divide-line overflow-hidden p-0">
          <template v-for="game in s.shown" :key="game.id">
            <GameRow :game="game" :team="team">
              <template v-if="canEdit" #actions>
                <GameStatsLink :game="game" class="btn-ghost" />
                <button
                  :id="'edit-game-' + game.id"
                  type="button"
                  class="btn-ghost"
                  :aria-label="'עריכת המשחק נגד ' + game.opponent.name"
                  :aria-expanded="editingId === game.id"
                  :aria-controls="'game-editor-' + game.id"
                  @click="editingId = editingId === game.id ? null : game.id"
                >עריכה</button>
              </template>
            </GameRow>
            <li v-if="editingId === game.id" :id="'game-editor-' + game.id" class="px-4 py-4 sm:px-5">
              <GameForm class="max-w-2xl" :team-id="team.id" :game="game" @saved="onSaved" @cancel="closeEditor" />
            </li>
          </template>
          <GameRow v-if="s.peek" :game="s.peek" :team="team" inert aria-hidden="true" class="max-h-14 overflow-hidden opacity-60 mask-b-to-transparent" />
        </ol>
        <p v-else class="empty-state">{{ s.empty }}</p>
        <button
          v-if="s.foldable"
          type="button"
          class="btn-ghost w-full sm:w-auto"
          :aria-controls="'games-' + s.key"
          :aria-expanded="expanded[s.key]"
          @click="toggleSection(s)"
        >{{ expanded[s.key] ? 'הצגת פחות' : `${s.all} (${s.games.length})` }}</button>
      </section>
    </template>
  </section>
</template>
