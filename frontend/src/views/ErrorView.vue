<script setup>
import { RouterLink } from 'vue-router'

const reload = () => window.location.reload()
</script>

<template>
  <section class="flex flex-col items-center gap-4 py-24 text-center">
    <span class="text-[7rem] font-black leading-none tracking-tighter text-ink/10">500</span>
    <h1 class="page-title">משהו השתבש</h1>
    <p class="text-muted">אירעה שגיאה לא צפויה.</p>
    <div class="flex gap-3">
      <button type="button" class="btn-primary" @click="reload">רענון העמוד</button>
      <RouterLink to="/" class="btn-secondary">לעמוד הבית</RouterLink>
    </div>
  </section>
</template>
