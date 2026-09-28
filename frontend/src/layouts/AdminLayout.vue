<script setup>
import { RouterView, useRouter } from 'vue-router'

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
      <nav class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <span class="text-lg font-bold">ניהול — גוש כדורסל</span>
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
