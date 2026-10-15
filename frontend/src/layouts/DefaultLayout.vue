<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import TabBar from '../components/TabBar.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'
import { clubTeamsOf, teamSlug, useSelectedTeam, useTeamFromRoute } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { backgroundSrc } from '../lib/backgrounds'
import { setCanonical, setJsonLd, setMeta, sportsTeamJsonLd } from '../lib/head'
import { onColor } from '../lib/teamColors'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

const navItems = computed(() => [
  { to: homePath.value, label: 'בית' },
  { to: teamBase.value + '/schedule', label: 'לוח משחקים' },
  ...(hasClubWeek.value ? [{ to: teamBase.value + '/club', label: 'מועדון' }] : []),
  { to: teamBase.value + '/standings', label: 'טבלה' },
  { to: teamBase.value + '/roster', label: 'שחקנים' },
  { to: teamBase.value + '/media', label: 'מדיה' },
  { to: teamBase.value + '/stats', label: 'סטטיסטיקה' },
])

const tabItems = computed(() => [
  { to: homePath.value, label: 'בית', icon: 'home', exact: true },
  { to: teamBase.value + '/schedule', label: 'משחקים', icon: 'calendar' },
  ...(hasClubWeek.value ? [{ to: teamBase.value + '/club', label: 'מועדון', icon: 'shield' }] : []),
  { to: teamBase.value + '/standings', label: 'טבלה', icon: 'table' },
  { to: teamBase.value + '/roster', label: 'שחקנים', icon: 'users' },
  { to: teamBase.value + '/media', label: 'מדיה', icon: 'media' },
  { to: teamBase.value + '/stats', label: 'נתונים', icon: 'chart' },
])

const teams = ref([])
const { user, checked, checkSession, logout } = useAuth()
const { selectedTeamId, markTeamsLoaded } = useSelectedTeam()

// Scoped to this layout's root so admin pages stay neutral; unset vars fall back in style.css.
const selectedTeam = computed(() => teams.value.find((t) => String(t.id) === selectedTeamId.value))
// Empty until teams load, so links fall back to the bare legacy paths (which redirect).
const heroImage = computed(() => `url("${backgroundSrc(selectedTeam.value?.background)}")`)
const teamBase = computed(() => (selectedTeam.value ? '/' + teamSlug(selectedTeam.value) : ''))
const homePath = computed(() => teamBase.value || '/')
const hasClubWeek = computed(() => clubTeamsOf(teams.value, selectedTeam.value).length > 1)
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

// The URL slug picks the team (useTeamFromRoute); slug-less pages follow the remembered team.
const route = useRoute()
const isHome = computed(() => ['home', 'team-home'].includes(route.name))
watch(selectedTeam, () => {
  if (!selectedTeam.value) return
  document.title = selectedTeam.value.name
  document.querySelector('link[rel="icon"]').href = selectedTeam.value.logo_url || LOGO_URL
}, { immediate: true })
// Crawler-facing head: description, canonical (query dropped), noindex on 404, SportsTeam on team home.
watch([selectedTeam, () => route.path, () => route.name], () => {
  const noindex = route.meta.noindex
  setMeta('robots', noindex ? 'noindex' : null)
  setCanonical(noindex ? null : location.origin + route.path)
  const team = selectedTeam.value
  if (!team) return
  setMeta('description', route.meta.description?.(team.name))
  setJsonLd(route.name === 'team-home' ? sportsTeamJsonLd(team, location.origin + homePath.value) : null)
}, { immediate: true })
useTeamFromRoute(teams)

onMounted(async () => {
  if (!checked.value) checkSession() // not awaited: don't delay the teams fetch
  try {
    teams.value = await apiFetch('/teams')
    markTeamsLoaded(teams.value)
  } catch {
    // leave teams empty — the switcher simply doesn't render
    markTeamsLoaded([]) // still marks the list as loaded so Home shows the welcome
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
            :aria-label="(selectedTeam?.name ?? 'GushBall') + ' — דף הבית'"
            class="flex min-h-11 min-w-0 items-center gap-2"
          >
            <!-- white tile: uploaded logos often carry their own white background -->
            <img
              v-if="selectedTeam?.logo_url"
              :src="selectedTeam.logo_url"
              alt=""
              class="size-9 shrink-0 rounded-lg bg-white object-contain p-0.5 md:size-10"
            />
            <img v-else :src="LOGO_URL" alt="GushBall" class="size-9 shrink-0 rounded md:size-10" />
            <span v-if="selectedTeam" class="truncate font-extrabold">{{ selectedTeam.name }}</span>
          </RouterLink>
          <a
            v-if="selectedTeam?.home_court_address"
            :href="'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(selectedTeam.home_court_address)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="selectedTeam.home_court_address"
            :title="selectedTeam.home_court_address"
            class="btn-icon"
            ><AppIcon name="pin"
          /></a>
          <RouterLink
            :to="{ name: 'teams' }"
            aria-label="כל הקבוצות"
            title="כל הקבוצות"
            class="btn-icon"
          >
            <AppIcon name="grid" />
          </RouterLink>
          <nav data-testid="top-nav" aria-label="ראשי" class="ms-auto hidden lg:block">
            <ul class="flex gap-6">
              <li v-for="item in navItems" :key="item.label">
                <RouterLink :to="item.to" class="nav-link">{{ item.label }}</RouterLink>
              </li>
            </ul>
          </nav>
          <ThemeToggle class="shrink-0 ms-auto lg:ms-0" />
          <template v-if="checked">
            <template v-if="user">
              <RouterLink v-if="user.is_admin" :to="teamBase + '/admin'" class="nav-link">ניהול</RouterLink>
              <!-- Admins reach /account from admin home below sm: the 390px header is full. -->
              <RouterLink
                :to="{ name: 'account' }"
                title="החשבון שלי"
                class="btn-icon sm:w-auto sm:gap-2 sm:px-3"
                :class="{ 'max-sm:hidden': user.is_admin }"
              >
                <AppIcon name="users" />
                <span class="max-w-32 truncate max-sm:sr-only" dir="auto">{{ user.display_name }}</span>
              </RouterLink>
              <button
                type="button"
                aria-label="התנתקות"
                title="התנתקות"
                class="btn-icon"
                @click="logout"
              >
                <AppIcon name="logout" />
              </button>
            </template>
            <RouterLink
              v-else
              :to="{ name: 'admin-login' }"
              aria-label="כניסה"
              title="כניסה"
              class="btn-icon"
            >
              <AppIcon name="login" />
            </RouterLink>
          </template>
        </div>
      </header>
    </div>

    <section
      v-if="selectedTeam && isHome"
      data-testid="hero"
      class="relative h-28 bg-brand bg-cover bg-[position:50%_65%] sm:h-40 [@media(max-height:30rem)]:h-16"
      :style="{ backgroundImage: heroImage }"
    >
      <!-- the header already shows logo + name; the hero is atmosphere only -->
      <div class="absolute inset-0 bg-linear-to-t from-surface to-transparent" aria-hidden="true" />
      <h1 class="sr-only">{{ selectedTeam.name }}</h1>
    </section>

    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 lg:pb-12">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>

    <!-- lg, not md: 7 public links crowd the md header (#341) -->
    <TabBar :items="tabItems" class="lg:hidden" />
  </div>
</template>
