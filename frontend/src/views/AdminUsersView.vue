<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import FilterCombobox from '../components/FilterCombobox.vue'
import SearchInput from '../components/SearchInput.vue'
import { fullAdmin, useAuth } from '../composables/useAuth'
import { useLeagueFilter } from '../composables/useLeagueFilter'
import { apiFetch } from '../lib/api'
import { scopeLabel, userLabel } from '../lib/format'
import { matchesQuery } from '../lib/search'

const ROLE_LABELS = { pending: 'ממתין', member: 'חבר', admin: 'מנהל' }

const { user } = useAuth()
const users = ref([])
const query = ref('')
const searchInput = ref(null)
const loading = ref(true)
const error = ref(null)
const pendingDelete = ref(null)

const teams = ref([])
const teamId = ref('') // '' = all teams
const { leagueId, leagueOptions, teamsInLeague } = useLeagueFilter(teams)
const teamOptions = computed(() => teamsInLeague.value.map((t) => ({ value: String(t.id), label: t.name })))
const filtering = computed(() => leagueId.value !== '' || teamId.value !== '')

// A league or team filter keeps users with a grant on a team in scope, or on a club that owns one.
const scopeTeams = computed(() => (teamId.value ? teams.value.filter((t) => String(t.id) === teamId.value) : teamsInLeague.value))
const inScope = (u) => {
  const ids = new Set(scopeTeams.value.map((t) => t.id))
  const clubs = new Set(scopeTeams.value.map((t) => t.club).filter(Boolean))
  return u.memberships.some((m) => ids.has(m.team_id) || clubs.has(m.club))
}
watch(leagueId, () => {
  if (!teamsInLeague.value.some((t) => String(t.id) === teamId.value)) teamId.value = ''
})

const shownUsers = computed(() =>
  users.value.filter(
    (u) =>
      (!filtering.value || inScope(u)) &&
      matchesQuery(query.value, [u.username, u.display_name, u.email, ...u.memberships.flatMap((m) => [m.team_name, m.club])]),
  ),
)
const badge = (m) => `${scopeLabel(m)} · ${ROLE_LABELS[m.role]}`

async function load() {
  loading.value = true
  error.value = null
  try {
    ;[users.value, teams.value] = await Promise.all([apiFetch('/users'), apiFetch('/teams').catch(() => [])])
  } catch (err) {
    error.value = err.message
  }
  loading.value = false
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

function clearFilters() {
  query.value = ''
  leagueId.value = ''
  teamId.value = ''
}

async function onDeleteConfirmed() {
  const target = pendingDelete.value
  pendingDelete.value = null
  try {
    await apiFetch(`/users/${target.id}`, { method: 'DELETE' })
    users.value = users.value.filter((u) => u.id !== target.id)
  } catch (err) {
    error.value = err.message
  }
}

const assignFor = ref(null) // id of the user whose assign panel is open
const assignScope = ref('team') // 'team' | 'club'
const assignTarget = ref('') // team id, or club name when assignScope is 'club'
const assigning = ref(false)
const assignError = ref(null)
const status = ref(null)

// A pending team stays listed: assigning it is the approve path.
const assignOptions = (u) => {
  const taken = new Set(u.memberships.filter((m) => m.team_id && m.role !== 'pending').map((m) => m.team_id))
  return teams.value.filter((t) => !taken.has(t.id)).map((t) => ({ value: String(t.id), label: t.name }))
}

const clubOptions = (u) => {
  const admined = new Set(u.memberships.filter((m) => m.club && m.role === 'admin').map((m) => m.club))
  const clubs = new Set(teams.value.map((t) => t.club).filter((c) => c && !admined.has(c)))
  return [...clubs].map((c) => ({ value: c, label: c }))
}
// The server only lets an approved account be made admin (#270).
const approved = (u) => u.memberships.some((m) => m.role !== 'pending')
const pickOptions = (u) => (assignScope.value === 'club' ? clubOptions(u) : assignOptions(u))
watch(assignScope, () => (assignTarget.value = ''))

async function openAssign(u) {
  assignFor.value = u.id
  assignScope.value = 'team'
  assignTarget.value = ''
  assignError.value = null
  status.value = null
  await nextTick()
  document.getElementById(`assign-team-${u.id}`)?.focus()
}

function closeAssign(u) {
  assignFor.value = null
  nextTick(() => document.getElementById(`assign-toggle-${u.id}`)?.focus())
}

async function assignTeam(u) {
  const m = await apiFetch(`/users/${u.id}/teams/${assignTarget.value}`, { method: 'PUT' })
  const i = u.memberships.findIndex((x) => x.team_id === m.team_id)
  if (i === -1) u.memberships.push(m)
  else u.memberships[i] = m
  status.value = `${userLabel(u)} שויך/ה לקבוצה ${m.team_name}`
}

async function assignClub(u) {
  const club = assignTarget.value
  // ponytail: assign_team_admin grants on team.club; any team of the club works. Add a club-keyed endpoint if a teamless club ever needs an admin.
  const team = teams.value.find((t) => t.club === club)
  await apiFetch(`/teams/${team.id}/admins/${u.id}`, { method: 'PUT', body: { scope: 'club' } })
  const existing = u.memberships.find((m) => m.club === club)
  if (existing) existing.role = 'admin'
  else u.memberships.push({ team_id: null, team_name: null, club, role: 'admin' })
  status.value = `${userLabel(u)} מונה/תה למנהל/ת מועדון ${club}`
}

async function onAssign(u) {
  assigning.value = true
  assignError.value = null
  const isClub = assignScope.value === 'club'
  try {
    await (isClub ? assignClub(u) : assignTeam(u))
    closeAssign(u)
  } catch {
    assignError.value = isClub ? 'שגיאה במינוי מנהל המועדון, נסו שוב' : 'שגיאה בשיוך לקבוצה, נסו שוב'
  }
  assigning.value = false
}

onMounted(() => {
  if (fullAdmin.value) load()
})
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">ניהול משתמשים</h1>
      <p v-if="users.length" class="text-sm text-muted">{{ users.length }} משתמשים</p>
    </div>

    <p v-if="!fullAdmin" class="empty-state">פעולה זו זמינה למנהל ראשי בלבד</p>
    <template v-else>
      <div v-if="error" class="card flex flex-wrap items-center gap-3" data-testid="list-error">
        <p class="error-text" role="alert">{{ error }}</p>
        <button type="button" class="btn-secondary ms-auto" @click="load">נסו שוב</button>
      </div>
      <div
        v-if="users.length"
        class="grid gap-3 sm:items-end"
        :class="leagueOptions.length > 1 ? 'sm:grid-cols-[16rem_16rem_minmax(0,1fr)]' : teams.length > 1 ? 'sm:grid-cols-[16rem_minmax(0,1fr)]' : ''"
      >
        <FilterCombobox
          v-if="leagueOptions.length > 1"
          id="user-league-filter"
          v-model="leagueId"
          label="ליגה"
          all-label="כל הליגות"
          :options="leagueOptions"
        />
        <FilterCombobox
          v-if="teams.length > 1"
          id="user-team-filter"
          v-model="teamId"
          label="קבוצה"
          all-label="כל הקבוצות"
          :options="teamOptions"
        />
        <SearchInput id="admin-user-search" ref="searchInput" v-model="query" label="חיפוש משתמש" />
      </div>
      <p v-if="status" class="text-sm text-muted" role="status">{{ status }}</p>
      <ul v-if="shownUsers.length" class="card divide-y divide-line p-0">
        <li v-for="u in shownUsers" :key="u.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span class="font-semibold" dir="auto">{{ userLabel(u) }}</span>
          <span class="text-sm text-muted" :dir="u.email ? 'ltr' : undefined">{{ u.email ?? 'ללא אימייל' }}</span>
          <div v-if="u.username !== user?.username" class="ms-auto flex gap-2">
            <button
              v-if="teams.length"
              :id="`assign-toggle-${u.id}`"
              type="button"
              class="btn-secondary"
              :aria-label="`שיוך ${userLabel(u)}`"
              :aria-expanded="assignFor === u.id"
              :aria-controls="`assign-panel-${u.id}`"
              @click="assignFor === u.id ? closeAssign(u) : openAssign(u)"
            >
              שיוך
            </button>
            <button type="button" class="btn-danger-ghost" :aria-label="`מחיקת ${userLabel(u)}`" @click="pendingDelete = u">
              מחיקה
            </button>
          </div>
          <div v-if="assignFor === u.id" :id="`assign-panel-${u.id}`" class="basis-full py-2">
            <fieldset v-if="clubOptions(u).length || assignScope === 'club'" class="mb-2">
              <legend class="field-label">סוג שיוך</legend>
              <label class="flex min-h-11 items-center gap-2">
                <input v-model="assignScope" type="radio" :name="`assign-scope-${u.id}`" value="team" class="size-5" />
                חבר בקבוצה
              </label>
              <label class="flex min-h-11 items-center gap-2">
                <input
                  v-model="assignScope"
                  type="radio"
                  :name="`assign-scope-${u.id}`"
                  value="club"
                  class="size-5"
                  :disabled="!approved(u)"
                  :aria-describedby="approved(u) ? undefined : `assign-club-hint-${u.id}`"
                />
                מנהל מועדון
              </label>
              <p v-if="!approved(u)" :id="`assign-club-hint-${u.id}`" class="text-sm text-muted">
                ניתן למנות רק משתמש מאושר (שייכו אותו לקבוצה קודם)
              </p>
            </fieldset>
            <p v-if="!pickOptions(u).length" class="text-sm text-muted">
              {{ assignScope === 'club' ? 'המשתמש כבר מנהל בכל המועדונים' : 'המשתמש כבר חבר בכל הקבוצות' }}
            </p>
            <div v-else class="grid gap-2 sm:grid-cols-[16rem_auto_auto] sm:items-end">
              <FilterCombobox
                :id="`assign-team-${u.id}`"
                v-model="assignTarget"
                :label="assignScope === 'club' ? 'מועדון' : 'קבוצה'"
                :options="pickOptions(u)"
              />
              <div class="flex gap-2">
                <button type="button" class="btn-primary" :disabled="!assignTarget || assigning" @click="onAssign(u)">
                  {{ assigning ? 'משייך…' : 'שיוך' }}
                </button>
                <button type="button" class="btn-secondary" @click="closeAssign(u)">ביטול</button>
              </div>
            </div>
            <p v-if="assignError" class="error-text mt-2" role="alert">{{ assignError }}</p>
          </div>
          <ul v-if="u.memberships.length" class="flex basis-full flex-wrap gap-1">
            <li v-for="(m, i) in u.memberships" :key="i" class="badge-muted">{{ badge(m) }}</li>
          </ul>
        </li>
      </ul>
      <div v-else-if="users.length && query.trim()" class="empty-state" aria-live="polite">
        <p>אין תוצאות עבור "{{ query.trim() }}".</p>
        <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
      </div>
      <div v-else-if="users.length" class="empty-state" aria-live="polite">
        <p>אין משתמשים בסינון הנבחר.</p>
        <button type="button" class="btn-secondary mt-3" @click="clearFilters">נקה סינון</button>
      </div>
      <div v-else-if="loading" class="space-y-2" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="skeleton h-14" />
      </div>
      <p v-else-if="!error" class="empty-state">אין משתמשים עדיין.</p>
    </template>

    <ConfirmDialog
      confirm-label="מחיקה"
      :open="pendingDelete !== null"
      :message="`למחוק את החשבון &quot;${pendingDelete ? userLabel(pendingDelete) : ''}&quot;? החשבון וכל החברויות שלו יימחקו לצמיתות.`"
      @update:open="(value) => !value && (pendingDelete = null)"
      @confirm="onDeleteConfirmed"
    />
  </section>
</template>
