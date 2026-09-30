<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'

import ErrorBoundary from '../components/ErrorBoundary.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useAuth } from '../composables/useAuth'

const { logout } = useAuth()
const router = useRouter()

async function onLogout() {
  await logout()
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
    <header class="border-b border-neutral-200 dark:border-neutral-700">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-2">
        <span class="font-bold">ניהול</span>
        <RouterLink to="/" class="section-link ms-auto">לאתר ↗</RouterLink>
        <ThemeToggle />
        <button type="button" class="btn-ghost" @click="onLogout">התנתקות</button>
      </div>
      <nav class="mx-auto max-w-6xl px-4">
        <ul class="scroll-row flex gap-5">
          <li><RouterLink :to="{ name: 'admin-home' }" active-class="" exact-active-class="font-bold" class="nav-link">ראשי</RouterLink></li>
          <li><RouterLink to="/admin/players" active-class="font-bold" class="nav-link">שחקנים</RouterLink></li>
          <li><RouterLink to="/admin/games" active-class="font-bold" class="nav-link">משחקים</RouterLink></li>
          <li><RouterLink to="/admin/standings" active-class="font-bold" class="nav-link">טבלת ליגה</RouterLink></li>
          <li><RouterLink :to="{ name: 'admin-teams' }" active-class="font-bold" class="nav-link">קבוצות</RouterLink></li>
        </ul>
      </nav>
    </header>

    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>
  </div>
</template>
