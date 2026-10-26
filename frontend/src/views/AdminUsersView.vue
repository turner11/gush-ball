<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import FilterCombobox from '../components/FilterCombobox.vue'
import SearchInput from '../components/SearchInput.vue'
import { fullAdmin, useAuth } from '../composables/useAuth'
import { useLeagueFilter } from '../composables/useLeagueFilter'
import { apiFetch } from '../lib/api'
import { userLabel } from '../lib/format'
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
const badge = (m) => `${m.team_name ?? m.club} · ${ROLE_LABELS[m.role]}`

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
      <ul v-if="shownUsers.length" class="card divide-y divide-line p-0">
        <li v-for="u in shownUsers" :key="u.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span class="font-semibold" dir="auto">{{ userLabel(u) }}</span>
          <span class="text-sm text-muted" :dir="u.email ? 'ltr' : undefined">{{ u.email ?? 'ללא אימייל' }}</span>
          <button
            v-if="u.username !== user?.username"
            type="button"
            class="btn-danger-ghost ms-auto"
            :aria-label="`מחיקת ${userLabel(u)}`"
            @click="pendingDelete = u"
          >
            מחיקה
          </button>
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
