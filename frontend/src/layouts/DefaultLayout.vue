<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { RouterLink, RouterView, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import FavoriteStar from '../components/FavoriteStar.vue'
import TabBar from '../components/TabBar.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { fullAdmin, previewMode, teamMember, useAuth } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import { teamSlug, useSelectedTeam, useTeamFromRoute } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { backgroundSrc } from '../lib/backgrounds'
import { pageTitle, setCanonical, setJsonLd, setMeta, sportsTeamJsonLd } from '../lib/head'
import { onColor } from '../lib/teamColors'

// Bound (not a static src) so the SFC compiler serves it from public/ as-is.
const LOGO_URL = '/logo.jpg'

const PREVIEWS = {
  member: { item: 'תצוגה כשחקן', banner: 'תצוגה כשחקן: כך רואים את האתר חברי הקבוצה' },
  anonymous: { item: 'תצוגה כאורח', banner: 'תצוגה כאורח: כך רואים את האתר גולשים שלא התחברו' },
}
const otherPreviews = computed(() => Object.entries(PREVIEWS).filter(([mode]) => mode !== previewMode.value))

// "בית" is a dropdown in the template, not a link here.
const navItems = computed(() => [
  { to: teamBase.value + '/schedule', label: 'לוח משחקים' },
  ...(clubPath.value ? [{ to: clubPath.value, label: 'מועדון' }] : []),
  { to: teamBase.value + '/standings', label: 'טבלה' },
  { to: teamBase.value + '/roster', label: 'שחקנים' },
  { to: teamBase.value + '/posts', label: 'עדכונים' },
  { to: teamBase.value + '/media', label: 'מדיה' },
  { to: teamBase.value + '/stats', label: 'נתונים' },
  ...(teamMember(selectedTeamId.value) ? [{ to: teamBase.value + '/playbook', label: 'פלייבוק' }] : []),
])

const tabItems = computed(() => [
  { to: homePath.value, label: 'בית', icon: 'home', exact: true },
  { to: teamBase.value + '/schedule', label: 'משחקים', icon: 'calendar' },
  ...(clubPath.value ? [{ to: clubPath.value, label: 'מועדון', icon: 'shield' }] : []),
  { to: teamBase.value + '/standings', label: 'טבלה', icon: 'table' },
  { to: teamBase.value + '/roster', label: 'שחקנים', icon: 'users' },
  { to: teamBase.value + '/media', label: 'מדיה', icon: 'media' },
  { to: teamBase.value + '/stats', label: 'נתונים', icon: 'chart' },
  ...(teamMember(selectedTeamId.value) ? [{ to: teamBase.value + '/playbook', label: 'פלייבוק', icon: 'clipboard' }] : []),
])

const clubs = ref([])
const { user, checked, checkSession, logout } = useAuth()
const { error: favError } = useFavorites()
const { selectedTeamId, teamsLoaded, teams, markTeamsLoaded } = useSelectedTeam()

// Scoped to this layout's root so admin pages stay neutral; unset vars fall back in style.css.
const selectedTeam = computed(() => teams.value.find((t) => String(t.id) === selectedTeamId.value))
// Empty until teams load, so links fall back to the bare legacy paths (which redirect).
const heroImage = computed(() => `url("${backgroundSrc(selectedTeam.value?.background)}")`)
const teamBase = computed(() => (selectedTeam.value ? '/' + teamSlug(selectedTeam.value) : ''))
const homePath = computed(() => teamBase.value || '/')
const mapsUrl = computed(() => {
  const address = selectedTeam.value?.home_court_address
  return address && 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)
})
const club = computed(() => clubs.value.find((c) => c.name === selectedTeam.value?.club))
const clubPath = computed(() => club.value && '/clubs/' + teamSlug(club.value))
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
  document.querySelector('link[rel="icon"]').href = selectedTeam.value.logo_url || LOGO_URL
}, { immediate: true })
// Crawler-facing head: description, canonical (query dropped), noindex on 404, SportsTeam on team home.
watch([selectedTeam, clubPath, () => route.path, () => route.name], () => {
  const noindex = route.meta.noindex
  setMeta('robots', noindex ? 'noindex' : null)
  setCanonical(noindex ? null : location.origin + route.path)
  if (route.name === 'club') return // ClubView owns the title, description and JSON-LD
  const team = selectedTeam.value
  if (!team) return
  setMeta('description', route.meta.description?.(team.name))
  if (route.name === 'player') return // PlayerView owns the title and the Person JSON-LD
  setJsonLd(route.name === 'team-home' ? sportsTeamJsonLd(team, location.origin + homePath.value, club.value && { name: club.value.name, url: location.origin + clubPath.value }) : null)
  document.title = pageTitle(route.params.slug && route.meta.title ? `${route.meta.title} · ${team.name}` : team.name, team.name_en)
}, { immediate: true })
useTeamFromRoute(teams)

onMounted(async () => {
  if (!checked.value) checkSession() // not awaited: don't delay the teams fetch
  apiFetch('/clubs').then((c) => (clubs.value = c), () => {}) // only hides the club link on failure
  try {
    teams.value = await apiFetch('/teams')
    markTeamsLoaded(teams.value)
  } catch {
    // leave teams empty — the switcher simply doesn't render; keep the remembered team (a blip isn't "deleted")
    teamsLoaded.value = true // so Home shows the welcome or the error instead of waiting forever
  }
})
</script>

<template>
  <div :style="teamStyle" class="flex min-h-dvh flex-col bg-surface text-ink">
    <a href="#main" class="btn-primary sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50">דלג לתוכן</a>
    <p v-if="favError" role="alert" class="card error-text fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm text-center lg:bottom-6">{{ favError }}</p>
    <div class="sticky top-0 z-40">
      <header
        :class="[
          'shadow-sm',
          teamStyle['--team-primary'] ? 'border-b-4 border-team-2 bg-team text-on-team' : 'bg-brand text-white',
        ]"
      >
        <div class="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 py-1 sm:px-6 md:min-h-16">
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
            <span v-if="selectedTeam" class="flex min-w-0 flex-col leading-tight">
              <span class="text-balance font-extrabold">{{ selectedTeam.name }}</span>
              <span v-if="selectedTeam.name_en" class="text-balance text-xs font-medium"><bdi lang="en">{{ selectedTeam.name_en }}</bdi></span>
            </span>
          </RouterLink>
          <FavoriteStar v-if="selectedTeam" :team-id="selectedTeam.id" :name="selectedTeam.name" class="max-sm:hidden" />
          <a
            v-if="mapsUrl"
            :href="mapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="selectedTeam.home_court_address"
            :title="selectedTeam.home_court_address"
            class="btn-icon"
            :class="{ 'lg:hidden': selectedTeamId }"
            ><AppIcon name="pin"
          /></a>
          <RouterLink
            :to="{ name: 'teams' }"
            aria-label="כל הקבוצות"
            title="כל הקבוצות"
            class="btn-icon"
            :class="{ 'lg:hidden': selectedTeamId }"
          >
            <AppIcon name="grid" />
          </RouterLink>
          <nav v-if="selectedTeamId" data-testid="top-nav" aria-label="ראשי" class="ms-auto hidden lg:block">
            <ul class="flex gap-4 xl:gap-6">
              <li>
                <DropdownMenuRoot>
                  <DropdownMenuTrigger as-child>
                    <button type="button" class="nav-link gap-1" :data-current="isHome || undefined">
                      בית <AppIcon name="chevron" class="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuContent align="start" :side-offset="4" class="menu-content">
                      <DropdownMenuItem as-child>
                        <RouterLink :to="homePath" class="menu-item">דף הבית</RouterLink>
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="selectedTeam?.ibasketball_team_url" as-child>
                        <a
                          :href="selectedTeam.ibasketball_team_url"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="דף הקבוצה באיגוד (נפתח בלשונית חדשה)"
                          class="menu-item"
                        >דף הקבוצה באיגוד</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="mapsUrl" as-child>
                        <a
                          :href="mapsUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="מגרש הבית (נפתח בלשונית חדשה)"
                          class="menu-item"
                        >מגרש הבית</a>
                      </DropdownMenuItem>
                      <DropdownMenuItem as-child>
                        <RouterLink :to="{ name: 'teams' }" class="menu-item">כל הקבוצות</RouterLink>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenuPortal>
                </DropdownMenuRoot>
              </li>
              <li v-for="item in navItems" :key="item.label">
                <RouterLink :to="item.to" class="nav-link">{{ item.label }}</RouterLink>
              </li>
            </ul>
          </nav>
          <ThemeToggle :class="['shrink-0 ms-auto', { 'lg:ms-0': selectedTeamId }]" />
          <template v-if="checked">
            <DropdownMenuRoot v-if="user">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  :aria-label="user.display_name + ' — תפריט חשבון'"
                  :title="user.display_name"
                  class="btn-icon"
                >
                  <AppIcon name="user" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent align="start" :side-offset="4" class="menu-content">
                  <DropdownMenuLabel class="truncate px-3 py-1.5 text-xs text-muted" dir="auto">{{ user.display_name }}</DropdownMenuLabel>
                  <DropdownMenuItem v-if="user.is_admin" as-child>
                    <RouterLink :to="teamBase + '/admin'" class="menu-item">ניהול</RouterLink>
                  </DropdownMenuItem>
                  <template v-if="user.is_admin">
                    <DropdownMenuItem
                      v-for="[mode, preview] in otherPreviews"
                      :key="mode"
                      class="menu-item"
                      @select="previewMode = mode"
                    >
                      {{ preview.item }}
                    </DropdownMenuItem>
                    <DropdownMenuItem v-if="previewMode" class="menu-item" @select="previewMode = null">חזרה לתצוגת מנהל</DropdownMenuItem>
                  </template>
                  <DropdownMenuItem v-if="!fullAdmin && !user.memberships?.length" as-child>
                    <RouterLink :to="{ name: 'join' }" class="menu-item">הצטרפות לקבוצה</RouterLink>
                  </DropdownMenuItem>
                  <DropdownMenuItem as-child>
                    <RouterLink :to="{ name: 'account' }" class="menu-item">החשבון שלי</RouterLink>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator class="my-1 h-px bg-line" />
                  <DropdownMenuItem class="menu-item" @select="logout">
                    <AppIcon name="logout" />
                    התנתקות
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenuRoot>
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
      <div v-if="previewMode && user" role="status" class="border-b border-line bg-sunken text-ink">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <p class="text-sm font-semibold">{{ PREVIEWS[previewMode].banner }}</p>
          <button type="button" class="btn-secondary" @click="previewMode = null">חזרה לתצוגת מנהל</button>
        </div>
      </div>
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
    <TabBar v-if="selectedTeamId" :items="tabItems" class="lg:hidden" />
  </div>
</template>
