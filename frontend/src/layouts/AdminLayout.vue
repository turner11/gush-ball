<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ErrorBoundary from '../components/ErrorBoundary.vue'
import TabBar from '../components/TabBar.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'

const tabItems = [
  { to: { name: 'admin-home' }, label: 'ראשי', icon: 'home', exact: true },
  { to: '/admin/players', label: 'שחקנים', icon: 'users' },
  { to: '/admin/games', label: 'משחקים', icon: 'calendar' },
  { to: '/admin/standings', label: 'טבלה', icon: 'table' },
  { to: { name: 'admin-teams' }, label: 'קבוצות', icon: 'shield' },
]

const { logout } = useAuth()
const router = useRouter()

async function onLogout() {
  await logout()
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-surface text-ink">
    <header class="sticky top-0 z-40 bg-brand text-white shadow-sm">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <RouterLink :to="{ name: 'admin-home' }" class="inline-flex min-h-11 items-center font-black">ניהול</RouterLink>
        <nav class="ms-6 hidden md:block">
          <ul class="flex gap-5">
            <li><RouterLink :to="{ name: 'admin-home' }" active-class="" exact-active-class="font-bold" class="nav-link">ראשי</RouterLink></li>
            <li><RouterLink to="/admin/players" active-class="font-bold" class="nav-link">שחקנים</RouterLink></li>
            <li><RouterLink to="/admin/games" active-class="font-bold" class="nav-link">משחקים</RouterLink></li>
            <li><RouterLink to="/admin/standings" active-class="font-bold" class="nav-link">טבלת ליגה</RouterLink></li>
            <li><RouterLink :to="{ name: 'admin-teams' }" active-class="font-bold" class="nav-link">קבוצות</RouterLink></li>
          </ul>
        </nav>
        <RouterLink to="/" class="nav-link ms-auto">לאתר</RouterLink>
        <ThemeToggle />
        <button type="button" class="btn-ghost" @click="onLogout">
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
