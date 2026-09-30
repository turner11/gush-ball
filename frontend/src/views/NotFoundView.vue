<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="flex flex-col items-center gap-4 py-24 text-center">
    <span class="text-[7rem] font-black leading-none tracking-tighter text-ink/10">404</span>
    <h1 class="page-title">איבדנו את הכדור</h1>
    <p class="text-muted">העמוד שחיפשת לא נמצא.</p>
    <RouterLink to="/" class="btn-primary">חזרה לעמוד הבית</RouterLink>
  </section>
</template>
