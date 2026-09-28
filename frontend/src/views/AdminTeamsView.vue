<script setup>
import { onMounted, ref } from 'vue'

import { useTeams } from '../composables/useTeams'

const { error, list, create, delete: destroy } = useTeams()

const teams = ref([])
const name = ref('')
const nameEn = ref('')
const submitting = ref(false)

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

async function onDelete(teamId) {
  if (!confirm('פעולה זו תמחק את הקבוצה וכל התוכן שלה (שחקנים, קישורים, משחקים וכו׳). להמשיך?')) {
    return
  }
  await destroy(teamId)
  teams.value = teams.value.filter((team) => team.id !== teamId)
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-bold">ניהול קבוצות</h1>

    <ul v-if="teams.length" class="space-y-1">
      <li
        v-for="team in teams"
        :key="team.id"
        class="flex items-center justify-between rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600"
      >
        <RouterLink :to="{ name: 'admin-team-edit', params: { id: team.id } }" class="underline">
          {{ team.name }} ({{ team.slug }})
        </RouterLink>
        <button
          type="button"
          class="text-sm text-red-600 dark:text-red-400"
          @click="onDelete(team.id)"
        >
          מחיקה
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-neutral-500">אין קבוצות עדיין.</p>

    <form class="max-w-sm space-y-3" @submit.prevent="onCreate">
      <h2 class="text-lg font-bold">קבוצה חדשה</h2>

      <div>
        <label for="new-team-name" class="block text-sm font-medium">שם</label>
        <input
          id="new-team-name"
          v-model="name"
          type="text"
          required
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <div>
        <label for="new-team-name-en" class="block text-sm font-medium">שם (אנגלית)</label>
        <input
          id="new-team-name-en"
          v-model="nameEn"
          type="text"
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="w-full rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        יצירה
      </button>
    </form>
  </section>
</template>
