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

    <ul v-if="teams.length" class="space-y-1">
      <li
        v-for="team in teams"
        :key="team.id"
        class="flex items-center justify-between rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600"
      >
        <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="underline">
          {{ team.name }}
        </RouterLink>
        <RouterLink :to="'/' + teamSlug(team)" class="text-sm underline" dir="ltr">/{{ teamSlug(team) }}</RouterLink>
        <button
          type="button"
          class="text-sm text-red-600 dark:text-red-400"
          @click="confirmDelete(team.id)"
        >
          מחיקה
        </button>
      </li>
    </ul>
    <p v-else class="empty-state">אין קבוצות עדיין.</p>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="פעולה זו תמחק את הקבוצה וכל התוכן שלה (שחקנים, קישורים, משחקים וכו׳). להמשיך?"
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />

    <form class="max-w-sm space-y-3" @submit.prevent="onCreate">
      <h2 class="section-title">קבוצה חדשה</h2>

      <div>
        <label for="new-team-name" class="field-label">שם</label>
        <input id="new-team-name" v-model="name" type="text" required class="field-input" />
      </div>

      <div>
        <label for="new-team-name-en" class="field-label">שם (אנגלית)</label>
        <input id="new-team-name-en" v-model="nameEn" type="text" class="field-input" />
      </div>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <button type="submit" :disabled="submitting" class="btn-primary w-full">יצירה</button>
    </form>
  </section>
</template>
