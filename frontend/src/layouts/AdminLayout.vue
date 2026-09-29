<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'

import ErrorBoundary from '../components/ErrorBoundary.vue'
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
      <nav class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <span class="section-title">ניהול — גוש כדורסל</span>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <RouterLink :to="{ name: 'admin-home' }" active-class="" exact-active-class="font-bold" class="hover:underline">ראשי</RouterLink>
          <RouterLink to="/admin/players" active-class="font-bold" class="hover:underline">שחקנים</RouterLink>
          <RouterLink to="/admin/games" active-class="font-bold" class="hover:underline">משחקים</RouterLink>
          <RouterLink to="/admin/standings" active-class="font-bold" class="hover:underline">טבלת ליגה</RouterLink>
          <RouterLink :to="{ name: 'admin-teams' }" active-class="font-bold" class="hover:underline">קבוצות</RouterLink>
        </div>
        <button type="button" class="text-sm hover:underline" @click="onLogout">התנתקות</button>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <ErrorBoundary>
        <RouterView />
      </ErrorBoundary>
    </main>
  </div>
</template>
