<script setup>
import { onMounted, ref } from 'vue'

import ConfirmDialog from '../components/ConfirmDialog.vue'
import { teamSlug } from '../composables/useSelectedTeam'
import { useTeams } from '../composables/useTeams'

const { error, list, create, delete: destroy } = useTeams()

const teams = ref([])
const name = ref('')
const nameEn = ref('')
const submitting = ref(false)
const pendingDeleteId = ref(null)

async function load() {
  teams.value = (await list()) ?? []
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

function confirmDelete(teamId) {
  pendingDeleteId.value = teamId
}

async function onDeleteConfirmed() {
  const teamId = pendingDeleteId.value
  pendingDeleteId.value = null
  await destroy(teamId)
  teams.value = teams.value.filter((team) => team.id !== teamId)
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">ניהול קבוצות</h1>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div>
        <ul v-if="teams.length" class="card divide-y divide-line p-0">
          <li v-for="team in teams" :key="team.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="font-semibold">
              {{ team.name }}
            </RouterLink>
            <RouterLink :to="'/' + teamSlug(team)" class="text-sm text-muted" dir="ltr">/{{ teamSlug(team) }}</RouterLink>
            <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="btn-ghost ms-auto">עריכה</RouterLink>
            <button type="button" class="btn-danger-ghost" @click="confirmDelete(team.id)">מחיקה</button>
          </li>
        </ul>
        <p v-else class="empty-state">אין קבוצות עדיין.</p>
      </div>

      <form class="card space-y-3 lg:sticky lg:top-20" @submit.prevent="onCreate">
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

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="פעולה זו תמחק את הקבוצה וכל התוכן שלה (שחקנים, קישורים, משחקים וכו׳). להמשיך?"
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />
  </section>
</template>
