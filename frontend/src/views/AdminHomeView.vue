<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-bold">אזור ניהול</h1>
    <nav class="flex flex-col gap-2">
      <RouterLink to="/admin/players" class="hover:underline">ניהול שחקנים</RouterLink>
      <RouterLink to="/admin/games" class="hover:underline">ניהול משחקים</RouterLink>
      <RouterLink to="/admin/standings" class="hover:underline">ניהול טבלת ליגה</RouterLink>
    </nav>
  </section>
</template>
