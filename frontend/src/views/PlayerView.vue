<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import PlayerProfileForm from '../components/PlayerProfileForm.vue'
import VideoCard from '../components/VideoCard.vue'
import { useAuth } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { pageTitle, playerJsonLd, setJsonLd } from '../lib/head'
import { DEFAULT_PLAYER_PHOTO, focusStyle, onPlayerImgError } from '../lib/playerPhoto'

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
// Own first photo only: tagged team images aren't portraits and carry no face focus.
const avatar = computed(() => player.value?.images?.[0])
const taggedImages = ref([])
const taggedVideos = ref([])
// Personal videos first; the key prefix keeps personal and team ids apart.
const videos = computed(() => [
  ...(player.value?.videos ?? []).map((v) => ({ ...v, key: 'p' + v.id })),
  ...taggedVideos.value.map((v) => ({ ...v, key: 't' + v.id })),
])

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
      if (id !== route.params.id) return // navigated away mid-load: don't clobber the new page's title/JSON-LD
      taggedImages.value = taggedNewestFirst(teamImages, p.id)
      taggedVideos.value = taggedNewestFirst(teamVideos, p.id)
      player.value = p
      team.value = t
      document.title = pageTitle(`${p.name} · ${t.name}`, p.name_en)
      setJsonLd(playerJsonLd(p, t, location.origin + route.path, `${location.origin}/${teamSlug(t)}`))
    } catch (e) {
      if (id !== route.params.id) return
      player.value = null
      setJsonLd(null)
      document.title = pageTitle('שחקן')
      error.value = e.status === 404 ? 'השחקן לא נמצא.' : 'שגיאה בטעינת השחקן, נסה שוב'
    } finally {
      if (id === route.params.id) loading.value = false
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="card flex flex-col items-center gap-4 sm:flex-row sm:gap-8" aria-busy="true">
      <div class="skeleton size-28 rounded-full sm:size-40" />
      <div class="space-y-3">
        <div class="skeleton h-10 w-16" />
        <div class="skeleton h-9 w-48" />
        <div class="skeleton h-5 w-32" />
      </div>
    </div>
    <template v-else-if="player">
      <header class="card flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-start">
        <div class="size-28 shrink-0 overflow-hidden rounded-full ring-4 ring-sunken sm:size-40">
          <img
            :src="avatar?.url || DEFAULT_PLAYER_PHOTO"
            alt=""
            data-testid="player-avatar"
            :style="focusStyle(avatar)"
            class="size-full object-cover object-top"
            @error="onPlayerImgError"
          />
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <p v-if="player.jersey_number != null" class="w-fit rounded-xl bg-team px-3 py-1 text-3xl font-black leading-none tabular-nums text-on-team max-sm:mx-auto sm:text-5xl">
            #{{ player.jersey_number }}
          </p>
          <h1 class="page-title">{{ player.name }}</h1>
          <p v-if="player.name_en" class="text-lg font-semibold text-muted"><bdi lang="en">{{ player.name_en }}</bdi></p>
          <RouterLink :to="'/' + teamSlug(team)" class="section-link">
            <img :src="team.logo_url || '/logo.jpg'" alt="" class="size-8 rounded-lg bg-white object-contain p-0.5" />
            {{ team.name }}
          </RouterLink>
          <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:justify-start">
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
      </header>
      <PlayerProfileForm v-if="isMine && editing" :player="player" @saved="onSaved" @cancel="closeEditor" />
      <ul v-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <li v-for="image in images" :key="image.key" class="card overflow-hidden">
          <img :src="image.url" :alt="image.alt" loading="lazy" class="aspect-square w-full object-cover object-top" />
        </li>
      </ul>
      <p v-else class="empty-state">אין תמונות עדיין.</p>
      <section v-if="videos.length" class="space-y-2">
        <h2 class="section-title">סרטונים</h2>
        <ul class="grid gap-6 sm:grid-cols-2">
          <li v-for="video in videos" :key="video.key"><VideoCard :video="video" /></li>
        </ul>
      </section>
    </template>
    <p v-else class="empty-state">{{ error }}</p>
  </section>
</template>
