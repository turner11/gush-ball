<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import TabBar from '../components/TabBar.vue'
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
  { to: '/stats', label: 'סטטיסטיקה' },
])

const tabItems = computed(() => [
  { to: homePath.value, label: 'בית', icon: 'home', exact: true },
  { to: '/schedule', label: 'משחקים', icon: 'calendar' },
  { to: '/standings', label: 'טבלה', icon: 'table' },
  { to: '/roster', label: 'שחקנים', icon: 'users' },
  { to: '/media', label: 'מדיה', icon: 'media' },
  { to: '/stats', label: 'סטטיסטיקה', icon: 'chart' },
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
const isHome = computed(() => ['home', 'team-home'].includes(route.name))
watch(selectedTeam, () => {
  if (selectedTeam.value) document.title = '🏀' + selectedTeam.value.name
}, { immediate: true })
watch([() => route.params.slug, () => route.name, teams], () => {
  if (!teams.value.length || !isHome.value) return
  const slug = String(route.params.slug ?? '').toLowerCase()
  const match = teams.value.find((t) => teamSlug(t) === slug)
  if (match) {
    selectedTeamId.value = String(match.id)
    return
  }
  // /<team id> redirects to that team's canonical slug; slugs above always win over ids.
  const fallback = teams.value.find((t) => String(t.id) === slug)
    ?? teams.value.find((t) => String(t.id) === selectedTeamId.value)
    ?? teams.value[0]
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
  <div :style="teamStyle" class="flex min-h-dvh flex-col bg-surface text-ink">
    <a href="#main" class="btn-primary sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50">דלג לתוכן</a>
    <div class="sticky top-0 z-40">
      <header
        :class="[
          'shadow-sm',
          teamStyle['--team-primary'] ? 'border-b-4 border-team-2 bg-team text-on-team' : 'bg-brand text-white',
        ]"
      >
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 md:h-16">
          <RouterLink
            :to="homePath"
            :aria-label="(selectedTeam?.name ?? 'גוש כדורסל') + ' — דף הבית'"
            class="flex min-h-11 min-w-0 items-center gap-2"
          >
            <!-- white tile: uploaded logos often carry their own white background -->
            <img
              v-if="selectedTeam?.logo_url"
              :src="selectedTeam.logo_url"
              alt=""
              class="size-9 shrink-0 rounded-lg bg-white object-contain p-0.5 md:size-10"
            />
            <img v-else :src="LOGO_URL" alt="גוש כדורסל" class="size-9 rounded md:size-10" />
            <span v-if="selectedTeam" class="truncate font-extrabold">{{ selectedTeam.name }}</span>
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
          <nav data-testid="top-nav" aria-label="ראשי" class="ms-auto hidden md:block">
            <ul class="flex gap-4 lg:gap-6">
              <li v-for="item in navItems" :key="item.label">
                <RouterLink :to="item.to" class="nav-link">{{ item.label }}</RouterLink>
              </li>
            </ul>
          </nav>
          <ThemeToggle class="ms-auto md:ms-0" />
        </div>
      </header>
    </div>

    <section
      v-if="selectedTeam && isHome"
      data-testid="hero"
      class="relative h-28 bg-brand bg-cover bg-[position:50%_65%] sm:h-40 [@media(max-height:30rem)]:h-16"
      :style="{ backgroundImage: `url(/backgrounds/${selectedTeam.background ?? 'hoop-1'}.jpg)` }"
    >
      <!-- the header already shows logo + name; the hero is atmosphere only -->
      <div class="absolute inset-0 bg-linear-to-t from-surface to-transparent" aria-hidden="true" />
      <h1 class="sr-only">{{ selectedTeam.name }}</h1>
    </section>

    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 md:pb-12">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>

    <TabBar :items="tabItems" />
  </div>
</template>
