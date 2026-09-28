<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const navItems = [
  { to: '/', label: 'בית' },
  { to: '/schedule', label: 'לוח משחקים' },
  { to: '/standings', label: 'טבלה' },
  { to: '/roster', label: 'שחקנים' },
]

const teams = ref([])
const { selectedTeamId, ensureDefault } = useSelectedTeam()

onMounted(async () => {
  try {
    teams.value = await apiFetch('/teams')
    ensureDefault(teams.value)
  } catch {
    // leave teams empty — the switcher simply doesn't render
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
    <header class="border-b border-neutral-200 dark:border-neutral-700">
      <nav class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <span class="text-lg font-bold">גוש כדורסל</span>
        <ul class="flex gap-4 text-sm">
          <li v-for="item in navItems" :key="item.to">
            <RouterLink :to="item.to" class="hover:underline">{{ item.label }}</RouterLink>
          </li>
        </ul>
        <select
          v-if="teams.length"
          id="team-switcher"
          v-model="selectedTeamId"
          class="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800"
        >
          <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
        </select>
        <ThemeToggle />
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>

    <footer class="border-t border-neutral-200 px-4 py-4 text-center text-sm text-neutral-500 dark:border-neutral-700">
      גוש כדורסל
    </footer>
  </div>
</template>
