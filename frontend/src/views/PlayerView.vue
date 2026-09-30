<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import VideoCard from '../components/VideoCard.vue'
import { apiFetch } from '../lib/api'

const route = useRoute()
const player = ref(null)
const loading = ref(true)
const error = ref('')
const taggedImages = ref([])
const taggedVideos = ref([])

// ponytail: tags live on the team's media (#131), so fetch the team's lists and filter here;
// move the filter server-side if a team's media grows large. Highest id = newest, as in MediaView.
const taggedNewestFirst = (items, playerId) =>
  items.filter((i) => i.player_ids.includes(playerId)).sort((a, b) => b.id - a.id)

// The player's own photos first, then team images they're tagged in.
const images = computed(() => [
  ...(player.value?.images ?? []).map((i) => ({ key: `p${i.id}`, url: i.url, alt: player.value.name })),
  ...taggedImages.value.map((i) => ({ key: `t${i.id}`, url: i.url, alt: i.title })),
])

watch(
  () => route.params.id,
  async (id) => {
    loading.value = true
    error.value = ''
    try {
      const p = await apiFetch(`/players/${id}`)
      const [teamImages, teamVideos] = await Promise.all([
        apiFetch(`/teams/${p.team_id}/images`),
        apiFetch(`/teams/${p.team_id}/videos`),
      ])
      taggedImages.value = taggedNewestFirst(teamImages, p.id)
      taggedVideos.value = taggedNewestFirst(teamVideos, p.id)
      player.value = p
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
      <ul v-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <li v-for="image in images" :key="image.key" class="card overflow-hidden">
          <img :src="image.url" :alt="image.alt" loading="lazy" class="aspect-square w-full object-cover object-top" />
        </li>
      </ul>
      <p v-else class="empty-state">אין תמונות עדיין.</p>
      <section v-if="taggedVideos.length" class="space-y-2">
        <h2 class="section-title">סרטונים</h2>
        <ul class="grid gap-6 sm:grid-cols-2">
          <li v-for="video in taggedVideos" :key="video.id"><VideoCard :video="video" /></li>
        </ul>
      </section>
    </template>
    <p v-else class="empty-state">{{ error }}</p>
  </section>
</template>
