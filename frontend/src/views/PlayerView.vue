<script setup>
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { apiFetch } from '../lib/api'

const route = useRoute()
const player = ref(null)
const loading = ref(true)
const error = ref('')

watch(
  () => route.params.id,
  async (id) => {
    loading.value = true
    error.value = ''
    try {
      player.value = await apiFetch(`/players/${id}`)
    } catch (e) {
      player.value = null
      error.value = e.status === 404 ? 'השחקן לא נמצא.' : 'שגיאה בטעינת השחקן, נסה שוב'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="skeleton h-40" aria-busy="true" />
    <template v-else-if="player">
      <div class="page-header">
        <h1 class="page-title">{{ player.name }}<template v-if="player.jersey_number != null"> #{{ player.jersey_number }}</template></h1>
        <RouterLink to="/roster" class="section-link">כל השחקנים</RouterLink>
      </div>
      <ul v-if="player.images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <li v-for="image in player.images" :key="image.id" class="card overflow-hidden">
          <img :src="image.url" :alt="player.name" loading="lazy" class="aspect-square w-full object-cover object-top" />
        </li>
      </ul>
      <p v-else class="empty-state">אין תמונות עדיין.</p>
    </template>
    <p v-else class="empty-state">{{ error }}</p>
  </section>
</template>
