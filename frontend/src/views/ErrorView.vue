<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  message: { type: String, default: '' },
})

const reload = () => window.location.reload()
</script>

<template>
  <section class="flex flex-col items-center gap-4 py-24 text-center">
    <span class="text-7xl font-black tracking-tight text-neutral-300 dark:text-neutral-700">500</span>
    <h1 class="text-xl font-bold">משהו השתבש</h1>
    <p class="text-neutral-600 dark:text-neutral-400">{{ message || 'אירעה שגיאה לא צפויה.' }}</p>
    <div class="flex gap-3">
      <button type="button" class="btn-primary" @click="reload">רענון העמוד</button>
      <RouterLink to="/" class="btn-secondary">לעמוד הבית</RouterLink>
    </div>
  </section>
</template>
