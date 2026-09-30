<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
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
  { to: '/roster#lineups', label: 'סטטיסטיקה' },
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
    ensureDefault([]) // still marks the list as loaded so Home shows the welcome
  }
})
</script>

<template>
  <div :style="teamStyle" class="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
    <a href="#main" class="btn-primary sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50">דלג לתוכן</a>
    <div class="sticky top-0 z-40">
      <header
        :class="[
          'shadow-md',
          teamStyle['--team-primary']
            ? 'border-b-4 border-team-2 bg-team text-on-team'
            : 'border-b border-neutral-200 bg-neutral-50/90 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90',
        ]"
      >
        <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 px-4">
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
              class="inline-flex size-11 items-center justify-center"
              ><AppIcon name="pin"
            /></a>
          </div>
          <ul class="scroll-row order-last flex w-full gap-5 md:order-2 md:ms-auto md:w-auto">
            <li v-for="item in navItems" :key="item.label">
              <RouterLink :to="item.to" class="nav-link">{{ item.label }}</RouterLink>
            </li>
          </ul>
          <div class="ms-auto md:order-3 md:ms-0"><ThemeToggle /></div>
        </nav>
      </header>

      <div
        v-if="selectedTeam"
        data-testid="hero"
        class="h-10 bg-cover bg-[position:50%_65%] sm:h-20"
        :style="{ backgroundImage: `url(/backgrounds/${selectedTeam.background ?? 'hoop-1'}.jpg)` }"
      >
      </div>
    </div>

    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>
  </div>
</template>
