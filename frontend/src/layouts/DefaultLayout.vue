<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { onColor } from '../lib/teamColors'

const navItems = [
  { to: '/', label: 'בית' },
  { to: '/schedule', label: 'לוח משחקים' },
  { to: '/standings', label: 'טבלה' },
  { to: '/roster', label: 'שחקנים' },
]

const teams = ref([])
const { selectedTeamId, ensureDefault } = useSelectedTeam()

// Scoped to this layout's root so admin pages stay neutral; unset vars fall back in style.css.
const teamStyle = computed(() => {
  const team = teams.value.find((t) => String(t.id) === selectedTeamId.value)
  const style = {}
  if (team?.primary_color) {
    style['--team-primary'] = team.primary_color
    style['--team-on-primary'] = onColor(team.primary_color)
  }
  if (team?.secondary_color) style['--team-secondary'] = team.secondary_color
  return style
})

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
  <div :style="teamStyle" class="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
    <header
      :class="
        teamStyle['--team-primary']
          ? 'border-b-4 border-team-2 bg-team text-on-team'
          : 'border-b border-neutral-200 dark:border-neutral-700'
      "
    >
      <nav class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <span class="section-title">גוש כדורסל</span>
        <ul class="flex gap-4 text-sm">
          <li v-for="item in navItems" :key="item.to">
            <RouterLink :to="item.to" class="hover:underline">{{ item.label }}</RouterLink>
          </li>
        </ul>
        <div v-if="teams.length" class="relative">
          <select
            id="team-switcher"
            aria-label="בחר קבוצה"
            v-model="selectedTeamId"
            class="appearance-none rounded border border-current bg-transparent py-1 ps-2 pe-8 text-sm [&>option]:bg-white [&>option]:text-neutral-900 dark:[&>option]:bg-neutral-800 dark:[&>option]:text-neutral-100"
          >
            <option v-for="team in teams" :key="team.id" :value="String(team.id)">{{ team.name }}</option>
          </select>
          <span
            aria-hidden="true"
            class="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs"
          >
            ▾
          </span>
        </div>
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
