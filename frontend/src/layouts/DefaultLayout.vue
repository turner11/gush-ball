<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { onColor } from '../lib/teamColors'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

const navItems = computed(() => [
  { to: homePath.value, label: 'בית' },
  { to: '/schedule', label: 'לוח משחקים' },
  { to: '/standings', label: 'טבלה' },
  { to: '/roster', label: 'שחקנים' },
  { to: '/media', label: 'מדיה' },
  { to: '/roster', label: 'סטטיסטיקה' },
])

const teams = ref([])
const { selectedTeamId, ensureDefault } = useSelectedTeam()

// Scoped to this layout's root so admin pages stay neutral; unset vars fall back in style.css.
const selectedTeam = computed(() => teams.value.find((t) => String(t.id) === selectedTeamId.value))
const homePath = computed(() => (selectedTeam.value ? '/' + teamSlug(selectedTeam.value) : '/'))
const teamStyle = computed(() => {
  const team = selectedTeam.value
  const style = {}
  if (team?.primary_color) {
    style['--team-primary'] = team.primary_color
    style['--team-on-primary'] = onColor(team.primary_color)
  }
  if (team?.secondary_color) style['--team-secondary'] = team.secondary_color
  return style
})

// The URL picks the team on home routes only; other pages follow the remembered team.
const route = useRoute()
const router = useRouter()
watch([() => route.params.slug, () => route.name, teams], () => {
  if (!teams.value.length || !['home', 'team-home'].includes(route.name)) return
  const slug = String(route.params.slug ?? '').toLowerCase()
  const match = teams.value.find((t) => teamSlug(t) === slug)
  if (match) {
    selectedTeamId.value = String(match.id)
    return
  }
  const fallback = teams.value.find((t) => String(t.id) === selectedTeamId.value) ?? teams.value[0]
  router.replace({ name: 'team-home', params: { slug: teamSlug(fallback) } })
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
    <div class="sticky top-0 z-40">
      <header
        :class="[
          'shadow-md',
          teamStyle['--team-primary']
            ? 'border-b-4 border-team-2 bg-team text-on-team'
            : 'border-b border-neutral-200 bg-neutral-50/90 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90',
        ]"
      >
        <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1">
          <div class="flex min-w-0 items-center gap-2">
            <RouterLink
              :to="homePath"
              :aria-label="(selectedTeam?.name ?? 'גוש כדורסל') + ' — דף הבית'"
              class="flex min-w-0 items-center gap-2"
            >
              <!-- ponytail: team logos are transparent PNGs, so no bg/rounded on them -->
              <img
                v-if="selectedTeam?.logo_url"
                :src="selectedTeam.logo_url"
                alt=""
                class="h-10 w-10 shrink-0 object-contain"
              />
              <img v-else :src="LOGO_URL" alt="גוש כדורסל" class="h-10 w-auto rounded" />
              <span v-if="selectedTeam" class="truncate font-bold">{{ selectedTeam.name }}</span>
            </RouterLink>
            <a
              v-if="selectedTeam?.home_court_address"
              :href="'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(selectedTeam.home_court_address)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="selectedTeam.home_court_address"
              :title="selectedTeam.home_court_address"
              class="text-xl"
              >📍</a
            >
          </div>
          <ul class="flex gap-4 text-sm">
            <li v-for="item in navItems" :key="item.label">
              <RouterLink :to="item.to" class="hover:underline">{{ item.label }}</RouterLink>
            </li>
          </ul>
          <ThemeToggle />
        </nav>
      </header>

      <div
        v-if="selectedTeam"
        data-testid="hero"
        class="h-16 bg-cover bg-[position:50%_65%] sm:h-20"
        :style="{ backgroundImage: `url(/backgrounds/${selectedTeam.background ?? 'hoop-1'}.jpg)` }"
      >
      </div>
    </div>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>
  </div>
</template>
