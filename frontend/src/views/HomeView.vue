<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import GameLocationLinks from '../components/GameLocationLinks.vue'
import PlayerCard from '../components/PlayerCard.vue'
import VideoCard from '../components/VideoCard.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { result, splitGames } from '../lib/games'

const team = ref(null)
const links = ref([])
const videos = ref([])
const images = ref([])
const posts = ref([])
const players = ref([])
const games = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

async function load() {
  if (!selectedTeamId.value) {
    team.value = null
    links.value = []
    videos.value = []
    images.value = []
    posts.value = []
    players.value = []
    games.value = []
    return
  }

  const id = selectedTeamId.value
  loading.value = true
  try {
    ;[team.value, links.value, videos.value, images.value, posts.value, players.value, games.value] = await Promise.all([
      apiFetch(`/teams/${id}`),
      apiFetch(`/teams/${id}/links`),
      apiFetch(`/teams/${id}/videos`),
      apiFetch(`/teams/${id}/images`),
      apiFetch(`/teams/${id}/posts`),
      apiFetch(`/teams/${id}/players`),
      apiFetch(`/teams/${id}/games`),
    ])
  } finally {
    loading.value = false
  }
}

watch(selectedTeamId, load, { immediate: true })

const nextGame = computed(() => splitGames(games.value).upcoming[0])
const lastGame = computed(() => splitGames(games.value).past[0])
const matchCards = computed(() =>
  [
    { title: 'המשחק האחרון', game: lastGame.value },
    { title: 'המשחק הבא', game: nextGame.value },
  ].filter((m) => m.game),
)

// ponytail: the API has no ORDER BY, so highest id = newest.
const newestPost = computed(() => posts.value.reduce((a, p) => (!a || p.id > a.id ? p : a), null))

// ponytail: same highest-id-is-newest rule; the media page lists the rest.
const latestVideos = computed(() => [...videos.value].sort((x, y) => y.id - x.id).slice(0, 2))

const facebookEmbedSrc = computed(
  () =>
    'https://www.facebook.com/plugins/page.php?href=' +
    encodeURIComponent(team.value.facebook_url) +
    '&tabs=timeline&width=500&height=600&small_header=true',
)

const instagramUsername = computed(() => {
  if (!team.value?.instagram_url) return null
  try {
    return new URL(team.value.instagram_url).pathname.split('/').filter(Boolean)[0] ?? null
  } catch {
    return null
  }
})

const hasSocial = computed(() => {
  const t = team.value
  return !!(t && (t.facebook_url || t.instagram_url || t.youtube_url || t.tiktok_url || t.twitter_url))
})

const hasSocialEmbed = computed(
  () => !!(team.value && (team.value.facebook_url || instagramUsername.value || team.value.twitter_url)),
)

// Load X's widgets.js once; it turns a.twitter-timeline anchors into timelines.
watch(
  () => team.value?.twitter_url,
  async (url) => {
    if (!url) return
    if (!document.getElementById('twitter-wjs')) {
      const script = document.createElement('script')
      script.id = 'twitter-wjs'
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      document.head.appendChild(script)
    }
    await nextTick()
    window.twttr?.widgets?.load()
  },
)
</script>

<template>
  <section v-if="loading && !team" class="space-y-8" aria-busy="true">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="skeleton h-40" />
      <div class="skeleton h-40" />
    </div>
    <div class="skeleton h-6 w-40" />
    <div class="skeleton h-32" />
  </section>

  <section v-else-if="team" class="space-y-8">
    <div class="grid gap-12" :class="{ 'md:grid-cols-[3fr_2fr]': hasSocial }">
      <div class="space-y-8">
        <div v-if="nextGame || lastGame" class="grid gap-4 sm:grid-cols-2">
          <div v-for="m in matchCards" :key="m.title" class="card flex flex-col gap-3">
            <div class="section-header">
              <h2 class="section-title">{{ m.title }}</h2>
              <span class="badge badge-muted">{{ m.game.is_home ? 'בית' : 'חוץ' }}</span>
            </div>
            <div class="flex items-center gap-3">
              <img v-if="m.game.opponent.logo_url" :src="m.game.opponent.logo_url" alt="" class="size-14 object-contain" />
              <p class="text-lg font-bold">{{ m.game.opponent.name }}</p>
            </div>
            <p v-if="m.game.team_score !== null && m.game.opponent_score !== null" class="flex items-center gap-3">
              <span class="text-3xl font-extrabold tabular-nums" dir="ltr">{{ m.game.team_score }} : {{ m.game.opponent_score }}</span>
              <span v-if="result(m.game)" :class="['badge', result(m.game) === 'W' ? 'badge-win' : 'badge-loss']">{{
                result(m.game) === 'W' ? 'ניצחון' : 'הפסד'
              }}</span>
            </p>
            <p class="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span>{{ formatDateTime(m.game.scheduled_at) }}</span>
              <GameLocationLinks v-if="m.game.is_home && team.home_court_address" :address="team.home_court_address" />
            </p>
            <RouterLink to="/schedule" class="section-link mt-auto">ללוח המשחקים</RouterLink>
          </div>
        </div>

        <section v-if="newestPost" class="space-y-3">
          <div class="section-header">
            <h2 class="section-title">עדכונים</h2>
            <RouterLink to="/media" class="section-link">כל העדכונים</RouterLink>
          </div>
          <article class="card space-y-1">
            <h3 class="font-semibold">{{ newestPost.title }}</h3>
            <p class="max-w-prose whitespace-pre-line text-neutral-600 dark:text-neutral-400">{{ newestPost.body }}</p>
          </article>
        </section>

        <section v-if="players.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">שחקנים</h2>
            <RouterLink to="/roster" class="section-link">כל השחקנים</RouterLink>
          </div>
          <ul class="scroll-row -mx-4 flex snap-x snap-mandatory gap-4 px-4 pb-2">
            <li v-for="player in players" :key="player.id" class="card w-36 shrink-0 snap-start">
              <PlayerCard :player="player" />
            </li>
          </ul>
        </section>

        <section v-if="videos.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">סרטונים</h2>
            <RouterLink to="/media" class="section-link">כל הסרטונים</RouterLink>
          </div>
          <ul class="space-y-4">
            <li v-for="video in latestVideos" :key="video.id">
              <VideoCard :video="video" />
            </li>
          </ul>
        </section>

        <section v-if="links.length" class="space-y-2">
          <h2 class="section-title">קישורים</h2>
          <ul class="flex flex-wrap gap-2">
            <li v-for="link in links" :key="link.id">
              <a :href="link.url" target="_blank" rel="noopener" class="btn-secondary gap-2">{{ link.label }}<AppIcon name="external" /></a>
            </li>
          </ul>
        </section>

        <section v-if="images.length" class="space-y-2">
          <h2 class="section-title">תמונות</h2>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <a v-for="image in images" :key="image.id" :href="image.url" target="_blank" rel="noopener">
              <img :src="image.url" :alt="image.title" loading="lazy" class="aspect-square w-full rounded-lg object-cover" />
            </a>
          </div>
        </section>
      </div>

      <aside v-if="hasSocial" class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <a v-if="team.facebook_url" :href="team.facebook_url" target="_blank" rel="noopener" class="btn-secondary">פייסבוק</a>
          <a v-if="team.instagram_url" :href="team.instagram_url" target="_blank" rel="noopener" class="btn-secondary">אינסטגרם</a>
          <a v-if="team.youtube_url" :href="team.youtube_url" target="_blank" rel="noopener" class="btn-secondary">יוטיוב</a>
          <a v-if="team.tiktok_url" :href="team.tiktok_url" target="_blank" rel="noopener" class="btn-secondary">טיקטוק</a>
          <a v-if="team.twitter_url" :href="team.twitter_url" target="_blank" rel="noopener" class="btn-secondary">טוויטר</a>
        </div>

        <section v-if="hasSocialEmbed" class="space-y-2">
          <h2 class="section-title">ברשתות</h2>
          <div class="space-y-4">
            <iframe
              v-if="team.facebook_url"
              :src="facebookEmbedSrc"
              title="עמוד הפייסבוק של הקבוצה"
              loading="lazy"
              class="h-[600px] w-full max-w-[500px] border-0"
            ></iframe>
            <!-- ponytail: undocumented IG profile embed (IG has no official profile-feed widget; official alternatives are per-post embeds or Graph API) -->
            <iframe
              v-if="instagramUsername"
              :src="`https://www.instagram.com/${instagramUsername}/embed`"
              title="עמוד האינסטגרם של הקבוצה"
              loading="lazy"
              class="h-[600px] w-full border-0"
            ></iframe>
            <div v-if="team.twitter_url" :key="team.twitter_url" class="h-[600px] overflow-hidden">
              <a class="twitter-timeline" data-height="600" :href="team.twitter_url">הטוויטר של הקבוצה</a>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>

  <section v-else class="space-y-2">
    <h1 class="page-title">ברוכים הבאים</h1>
    <p class="text-neutral-600 dark:text-neutral-400">אין קבוצות במערכת עדיין.</p>
  </section>
</template>
