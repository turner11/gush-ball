<script setup>
import { computed, onMounted, ref } from 'vue'

import ClubsSection from '../components/ClubsSection.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SearchInput from '../components/SearchInput.vue'
import { fullAdmin, ownTeams } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { useTeams } from '../composables/useTeams'
import { matchesQuery } from '../lib/search'

const { error, list, create, delete: destroy } = useTeams()

const teams = ref([])
const name = ref('')
const nameEn = ref('')
const query = ref('')
const searchInput = ref(null)
const shownTeams = computed(() =>
  ownTeams(teams.value).filter((t) => matchesQuery(query.value, [t.name, t.name_en, t.club])),
)
const loading = ref(true)
const listError = ref(null) // load/delete failures, shown above the list (the form's `error` is for creating)
const submitting = ref(false)
const pendingDeleteId = ref(null)

async function load() {
  listError.value = null
  const loaded = await list()
  if (!loaded) listError.value = error.value
  else teams.value = loaded
  error.value = null
  loading.value = false
}

async function onCreate() {
  submitting.value = true
  try {
    const payload = { name: name.value }
    if (nameEn.value) payload.name_en = nameEn.value
    const created = await create(payload)
    if (created && !error.value) {
      teams.value.push(created)
      name.value = ''
      nameEn.value = ''
    }
  } finally {
    submitting.value = false
  }
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

function confirmDelete(teamId) {
  pendingDeleteId.value = teamId
}

async function onDeleteConfirmed() {
  const teamId = pendingDeleteId.value
  pendingDeleteId.value = null
  await destroy(teamId)
  if (error.value) {
    listError.value = error.value
    error.value = null
    return
  }
  teams.value = teams.value.filter((team) => team.id !== teamId)
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">ניהול קבוצות</h1>
      <div v-if="fullAdmin" class="flex flex-wrap gap-2">
        <RouterLink :to="{ name: 'admin-teams-batch-edit' }" class="btn-secondary">עריכה מרובה</RouterLink>
        <RouterLink :to="{ name: 'admin-teams-import' }" class="btn-secondary">ייבוא קבוצות מאגודה</RouterLink>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <div v-if="listError" class="card flex flex-wrap items-center gap-3" data-testid="list-error">
          <p class="error-text" role="alert">{{ listError }}</p>
          <button type="button" class="btn-secondary ms-auto" @click="load">נסו שוב</button>
        </div>
        <SearchInput v-if="teams.length" id="admin-team-search" ref="searchInput" v-model="query" label="חיפוש קבוצה" />
        <ul v-if="shownTeams.length" class="card divide-y divide-line p-0">
          <li v-for="team in shownTeams" :key="team.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="font-semibold">
              {{ team.name }}
            </RouterLink>
            <RouterLink :to="'/' + teamSlug(team)" class="text-sm text-muted" dir="ltr">/{{ teamSlug(team) }}</RouterLink>
            <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="btn-ghost ms-auto">עריכה</RouterLink>
            <button v-if="fullAdmin" type="button" class="btn-danger-ghost" @click="confirmDelete(team.id)">מחיקה</button>
          </li>
        </ul>
        <div v-else-if="teams.length" class="empty-state" aria-live="polite">
          <p>אין תוצאות עבור "{{ query.trim() }}".</p>
          <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
        </div>
        <div v-else-if="loading" class="space-y-2" aria-hidden="true">
          <div v-for="n in 3" :key="n" class="skeleton h-14" />
        </div>
        <p v-else-if="!listError" class="empty-state">אין קבוצות עדיין.</p>
      </div>

      <form v-if="fullAdmin" class="card space-y-3 lg:sticky lg:top-20" @submit.prevent="onCreate">
        <h2 class="section-title">קבוצה חדשה</h2>

        <div>
          <label for="new-team-name" class="field-label">שם</label>
          <input id="new-team-name" v-model="name" type="text" required class="field-input" />
        </div>

        <div>
          <label for="new-team-name-en" class="field-label">שם (אנגלית)</label>
          <input id="new-team-name-en" v-model="nameEn" type="text" class="field-input" />
        </div>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <button type="submit" :disabled="submitting" class="btn-primary w-full">יצירה</button>
      </form>
    </div>

    <ClubsSection v-if="fullAdmin" />

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="פעולה זו תמחק את הקבוצה וכל התוכן שלה (שחקנים, קישורים, משחקים וכו׳). להמשיך?"
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />
  </section>
</template>
