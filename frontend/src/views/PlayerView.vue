<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import PlayerProfileForm from '../components/PlayerProfileForm.vue'
import VideoCard from '../components/VideoCard.vue'
import { useAuth } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { pageTitle, playerJsonLd, setJsonLd } from '../lib/head'

const route = useRoute()
const { user } = useAuth()
const editing = ref(false)
const editButton = ref(null)
const isMine = computed(() => !!player.value && !!user.value?.player_ids?.includes(player.value.id))

function onSaved(updated) {
  player.value = updated
}

async function closeEditor() {
  editing.value = false
  await nextTick()
  editButton.value?.focus()
}
const player = ref(null)
const team = ref(null)
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
      const [t, teamImages, teamVideos] = await Promise.all([
        apiFetch(`/teams/${p.team_id}`),
        apiFetch(`/teams/${p.team_id}/images`),
        apiFetch(`/teams/${p.team_id}/videos`),
      ])
      taggedImages.value = taggedNewestFirst(teamImages, p.id)
      taggedVideos.value = taggedNewestFirst(teamVideos, p.id)
      player.value = p
      team.value = t
      document.title = pageTitle(`${p.name} · ${t.name}`, p.name_en)
      setJsonLd(playerJsonLd(p, t, location.origin + route.path, `${location.origin}/${teamSlug(t)}`))
    } catch (e) {
      player.value = null
      setJsonLd(null)
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
        <div>
          <h1 class="page-title">{{ player.name }}<template v-if="player.jersey_number != null"> #{{ player.jersey_number }}</template></h1>
          <p v-if="player.name_en" class="mt-1 text-lg font-semibold text-muted"><bdi lang="en">{{ player.name_en }}</bdi></p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <button
            v-if="isMine"
            ref="editButton"
            type="button"
            class="btn-secondary"
            :aria-expanded="editing"
            aria-controls="profile-form"
            @click="editing = !editing"
          >
            עריכת הפרופיל שלי
          </button>
          <RouterLink :to="{ name: 'roster', params: { slug: String(player.team_id) } }" class="section-link">כל השחקנים של {{ team.name }}</RouterLink>
        </div>
      </div>
      <PlayerProfileForm v-if="isMine && editing" :player="player" @saved="onSaved" @cancel="closeEditor" />
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
