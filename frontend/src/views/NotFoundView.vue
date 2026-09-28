<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="flex flex-col items-center gap-4 py-24 text-center">
    <span class="text-7xl font-black tracking-tight text-neutral-300 dark:text-neutral-700">404</span>
    <h1 class="text-xl font-bold">איבדנו את הכדור</h1>
    <p class="text-neutral-600 dark:text-neutral-400">העמוד שחיפשת לא נמצא.</p>
    <RouterLink to="/" class="btn-primary">חזרה לעמוד הבית</RouterLink>
  </section>
</template>
