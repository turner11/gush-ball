<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import TabBar from '../components/TabBar.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { ownTeams, useAuth } from '../composables/useAuth'
import { useTeamFromRoute } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const { logout } = useAuth()
const router = useRouter()
const route = useRoute()

// Players and games are per team, so their URLs carry the slug; standings and teams are club-wide and stay bare.
const base = computed(() => (route.params.slug ? '/' + route.params.slug : ''))
const tabItems = computed(() => [
  { to: base.value + '/admin', label: 'ראשי', icon: 'home', exact: true },
  { to: base.value + '/admin/players', label: 'שחקנים', icon: 'users' },
  { to: base.value + '/admin/games', label: 'משחקים', icon: 'calendar' },
  { to: '/admin/standings', label: 'טבלה', icon: 'table' },
  { to: { name: 'admin-teams' }, label: 'קבוצות', icon: 'shield' },
])

// A team admin's list holds only their own team, so a foreign or unknown slug falls back to it.
const teams = ref([])
useTeamFromRoute(teams)
onMounted(async () => {
  try {
    teams.value = ownTeams(await apiFetch('/teams'))
  } catch {
    // leave teams empty: the slug is left as typed and the page shows its own error state
  }
})

async function onLogout() {
  await logout()
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-surface text-ink">
    <header class="sticky top-0 z-40 bg-brand text-white shadow-sm">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <RouterLink :to="base + '/admin'" class="inline-flex min-h-11 items-center font-black">ניהול</RouterLink>
        <nav class="ms-6 hidden md:block">
          <ul class="flex gap-5">
            <li><RouterLink :to="base + '/admin'" active-class="" exact-active-class="font-bold" class="nav-link">ראשי</RouterLink></li>
            <li><RouterLink :to="base + '/admin/players'" active-class="font-bold" class="nav-link">שחקנים</RouterLink></li>
            <li><RouterLink :to="base + '/admin/games'" active-class="font-bold" class="nav-link">משחקים</RouterLink></li>
            <li><RouterLink to="/admin/standings" active-class="font-bold" class="nav-link">טבלת ליגה</RouterLink></li>
            <li><RouterLink :to="{ name: 'admin-teams' }" active-class="font-bold" class="nav-link">קבוצות</RouterLink></li>
          </ul>
        </nav>
        <RouterLink :to="base || '/'" class="nav-link ms-auto">לאתר</RouterLink>
        <ThemeToggle />
        <button type="button" class="btn-ghost hover:bg-white/10" @click="onLogout">
          <AppIcon name="logout" />
          <span class="max-sm:sr-only">התנתקות</span>
        </button>
      </div>
    </header>

    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-10 md:pb-12">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>

    <TabBar :items="tabItems" />
  </div>
</template>
