<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import GameLocationLinks from '../components/GameLocationLinks.vue'
import PlayerCard from '../components/PlayerCard.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { splitGames } from '../lib/games'

const team = ref(null)
const links = ref([])
const videos = ref([])
const images = ref([])
const posts = ref([])
const players = ref([])
const games = ref([])

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
  ;[team.value, links.value, videos.value, images.value, posts.value, players.value, games.value] = await Promise.all([
    apiFetch(`/teams/${id}`),
    apiFetch(`/teams/${id}/links`),
    apiFetch(`/teams/${id}/videos`),
    apiFetch(`/teams/${id}/images`),
    apiFetch(`/teams/${id}/posts`),
    apiFetch(`/teams/${id}/players`),
    apiFetch(`/teams/${id}/games`),
  ])
}

watch(selectedTeamId, load, { immediate: true })

const nextGame = computed(() => splitGames(games.value).upcoming[0])
const lastGame = computed(() => splitGames(games.value).past[0])

// ponytail: the API has no ORDER BY, so highest id = newest.
const newestPost = computed(() => posts.value.reduce((a, p) => (!a || p.id > a.id ? p : a), null))

function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)
      return m ? m[1] : null
    }
  } catch {
    // fall through to a plain link
  }
  return null
}

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
  <section v-if="team" class="space-y-8">
    <div class="grid gap-12" :class="{ 'md:grid-cols-[3fr_2fr]': hasSocial }">
      <div class="space-y-8">
        <div v-if="nextGame || lastGame" class="grid gap-4 sm:grid-cols-2">
          <div v-if="lastGame" class="card space-y-1">
            <h2 class="section-title">המשחק האחרון</h2>
            <p class="flex items-center gap-2 font-semibold">
              <img v-if="lastGame.opponent.logo_url" :src="lastGame.opponent.logo_url" alt="" class="h-8 w-8 object-contain" />
              {{ lastGame.opponent.name }}
            </p>
            <p class="flex items-center gap-2 text-sm">
              <span>{{ formatDateTime(lastGame.scheduled_at) }} · {{ lastGame.is_home ? 'בית' : 'חוץ' }}</span>
              <GameLocationLinks v-if="lastGame.is_home && team.home_court_address" :address="team.home_court_address" />
            </p>
            <p v-if="lastGame.team_score !== null && lastGame.opponent_score !== null" class="font-semibold">
              {{ lastGame.team_score }} : {{ lastGame.opponent_score }}
            </p>
          </div>
          <div v-if="nextGame" class="card space-y-1">
            <h2 class="section-title">המשחק הבא</h2>
            <p class="flex items-center gap-2 font-semibold">
              <img v-if="nextGame.opponent.logo_url" :src="nextGame.opponent.logo_url" alt="" class="h-8 w-8 object-contain" />
              {{ nextGame.opponent.name }}
            </p>
            <p class="flex items-center gap-2 text-sm">
              <span>{{ formatDateTime(nextGame.scheduled_at) }} · {{ nextGame.is_home ? 'בית' : 'חוץ' }}</span>
              <GameLocationLinks v-if="nextGame.is_home && team.home_court_address" :address="team.home_court_address" />
            </p>
          </div>
        </div>

        <section v-if="newestPost" class="space-y-3">
          <h2 class="section-title">עדכונים</h2>
          <article class="space-y-1">
            <h3 class="font-semibold">{{ newestPost.title }}</h3>
            <p class="text-neutral-600 dark:text-neutral-400">{{ newestPost.body }}</p>
          </article>
        </section>

        <section v-if="players.length" class="space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="section-title">שחקנים</h2>
            <RouterLink to="/roster" class="text-sm hover:underline">כל השחקנים</RouterLink>
          </div>
          <ul class="flex snap-x snap-mandatory gap-4 overflow-x-auto">
            <li v-for="player in players" :key="player.id" class="card shrink-0 snap-start">
              <PlayerCard :player="player" />
            </li>
          </ul>
        </section>

        <section v-if="videos.length" class="space-y-2">
          <h2 class="section-title">סרטונים</h2>
          <ul class="space-y-4">
            <li v-for="video in videos" :key="video.id">
              <iframe
                v-if="youtubeId(video.url)"
                :src="`https://www.youtube-nocookie.com/embed/${youtubeId(video.url)}`"
                :title="video.title"
                loading="lazy"
                allowfullscreen
                class="aspect-video w-full border-0"
              ></iframe>
              <a v-else :href="video.url" target="_blank" rel="noopener" class="hover:underline">{{ video.title }}</a>
            </li>
          </ul>
        </section>

        <section v-if="links.length" class="space-y-2">
          <h2 class="section-title">קישורים</h2>
          <ul class="space-y-1">
            <li v-for="link in links" :key="link.id">
              <a :href="link.url" target="_blank" rel="noopener" class="hover:underline">{{ link.label }}</a>
            </li>
          </ul>
        </section>

        <section v-if="images.length" class="space-y-2">
          <h2 class="section-title">תמונות</h2>
          <div class="flex flex-wrap gap-3">
            <img v-for="image in images" :key="image.id" :src="image.url" :alt="image.title" class="h-24 w-24 rounded object-cover" />
          </div>
        </section>
      </div>

      <aside v-if="hasSocial" class="space-y-4">
        <div class="flex gap-3 text-sm">
          <a v-if="team.facebook_url" :href="team.facebook_url" target="_blank" rel="noopener" class="hover:underline">פייסבוק</a>
          <a v-if="team.instagram_url" :href="team.instagram_url" target="_blank" rel="noopener" class="hover:underline">אינסטגרם</a>
          <a v-if="team.youtube_url" :href="team.youtube_url" target="_blank" rel="noopener" class="hover:underline">יוטיוב</a>
          <a v-if="team.tiktok_url" :href="team.tiktok_url" target="_blank" rel="noopener" class="hover:underline">טיקטוק</a>
          <a v-if="team.twitter_url" :href="team.twitter_url" target="_blank" rel="noopener" class="hover:underline">טוויטר</a>
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
