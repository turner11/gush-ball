<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import GameLocationLinks from '../components/GameLocationLinks.vue'
import PlayerCard from '../components/PlayerCard.vue'
import VideoCard from '../components/VideoCard.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime, formatGameDate } from '../lib/format'
import { homeFirst, played, result, splitGames } from '../lib/games'

const team = ref(null)
const links = ref([])
const videos = ref([])
const images = ref([])
const posts = ref([])
const players = ref([])
const games = ref([])
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId, teamsLoaded } = useSelectedTeam()

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
  ]
    .filter((m) => m.game)
    .map((m) => {
      const g = m.game
      const us = { name: team.value.name, logo: team.value.logo_url || '/logo.jpg', score: g.team_score }
      const them = { name: g.opponent.name, logo: g.opponent.logo_url, score: g.opponent_score }
      return { ...m, d: formatGameDate(g.scheduled_at), played: played(g), sides: homeFirst(g, us, them) }
    }),
)

const addressOf = (g) => (g.is_home ? team.value.home_court_address : g.opponent.address)
const lone = computed(() => matchCards.value.length === 1)

// ponytail: the API has no ORDER BY, so highest id = newest.
const newestPost = computed(() => posts.value.reduce((a, p) => (!a || p.id > a.id ? p : a), null))

// ponytail: same highest-id-is-newest rule; the media page lists the rest.
const latestVideos = computed(() => [...videos.value].sort((x, y) => y.id - x.id).slice(0, 2))

// The page plugin renders at a fixed `width` (180–500) and clips inside a narrower frame, so measure the frame first.
// ponytail: measured once on mount; a resize/rotation keeps the first width until reload.
const fbFrame = ref(null)
const fbWidth = ref(null)
watch(fbFrame, (el) => {
  if (el) fbWidth.value = Math.round(Math.min(500, Math.max(180, el.clientWidth)))
})
const facebookEmbedSrc = computed(
  () =>
    fbWidth.value &&
    'https://www.facebook.com/plugins/page.php?href=' +
      encodeURIComponent(team.value.facebook_url) +
      `&tabs=timeline&width=${fbWidth.value}&height=400&small_header=true`,
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
  <section v-if="!team && (loading || (!selectedTeamId && !teamsLoaded))" class="space-y-8" aria-busy="true">
    <div class="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <div class="skeleton h-40" />
      <div class="skeleton h-40" />
    </div>
    <div class="skeleton h-6 w-40" />
    <div class="skeleton h-32" />
  </section>

  <section v-else-if="team" class="space-y-10 sm:space-y-14">
    <!-- side-by-side only from lg; a fixed 20rem aside keeps the embeds secondary to the content -->
    <div class="grid gap-12" :class="{ 'lg:grid-cols-[1fr_20rem]': hasSocial }">
      <!-- min-w-0: without it the player carousel's width stretches this track and overflows the page -->
      <div class="min-w-0 space-y-10 sm:space-y-14">
        <div v-if="nextGame || lastGame" class="grid gap-3 sm:gap-4" :class="{ 'sm:grid-cols-2': !lone }">
          <div v-for="m in matchCards" :key="m.title" class="card flex flex-col gap-4" :class="{ 'sm:gap-6 sm:p-8': lone }">
            <div class="section-header">
              <h2 class="eyebrow">{{ m.title }}</h2>
              <span class="badge badge-muted">{{ m.game.is_home ? 'בית' : 'חוץ' }}</span>
            </div>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <div class="min-w-0 space-y-1">
                <img v-if="m.sides[0].logo" :src="m.sides[0].logo" alt="" class="mx-auto size-12 object-contain" :class="lone ? 'sm:size-24' : 'sm:size-14'" />
                <p class="truncate text-sm font-bold" :class="{ 'sm:text-lg': lone }">{{ m.sides[0].name }}</p>
              </div>
              <div class="space-y-1">
                <template v-if="m.played">
                  <p class="score" :class="{ 'sm:text-6xl': lone }">{{ m.sides[0].score }} : {{ m.sides[1].score }}</p>
                  <span v-if="result(m.game)" :class="['badge', result(m.game) === 'W' ? 'badge-win' : 'badge-loss']">{{
                    result(m.game) === 'W' ? 'ניצחון' : 'הפסד'
                  }}</span>
                </template>
                <template v-else-if="m.d">
                  <p class="text-2xl font-black tabular-nums" :class="{ 'sm:text-6xl': lone }">{{ m.d.time }}</p>
                  <p class="text-xs text-muted" :class="{ 'sm:text-sm': lone }">
                    {{ m.d.weekday }} {{ m.d.day }}
                    {{ m.d.month }}
                  </p>
                </template>
              </div>
              <div class="min-w-0 space-y-1">
                <img v-if="m.sides[1].logo" :src="m.sides[1].logo" alt="" class="mx-auto size-12 object-contain" :class="lone ? 'sm:size-24' : 'sm:size-14'" />
                <p class="truncate text-sm font-bold" :class="{ 'sm:text-lg': lone }">{{ m.sides[1].name }}</p>
              </div>
            </div>
            <div class="mt-auto flex flex-wrap items-center gap-2 text-sm text-muted">
              <!-- an unplayed game already shows its date in the middle -->
              <span v-if="m.played">{{ formatDateTime(m.game.scheduled_at) }}</span>
              <GameLocationLinks v-if="addressOf(m.game)" :address="addressOf(m.game)" />
              <RouterLink to="/schedule" class="section-link ms-auto">ללוח המשחקים</RouterLink>
            </div>
          </div>
        </div>

        <section v-if="newestPost" class="space-y-3">
          <div class="section-header">
            <h2 class="section-title">עדכונים</h2>
            <RouterLink to="/media" class="section-link">כל העדכונים</RouterLink>
          </div>
          <article class="card space-y-1">
            <h3 class="text-lg font-extrabold">{{ newestPost.title }}</h3>
            <p class="line-clamp-6 max-w-prose whitespace-pre-line text-muted">{{ newestPost.body }}</p>
          </article>
        </section>

        <section v-if="players.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">שחקנים</h2>
            <RouterLink to="/roster" class="section-link">כל השחקנים</RouterLink>
          </div>
          <!-- swipe row on touch widths; from md a wrapping grid (mouse users can't scroll a hidden-scrollbar row) -->
          <ul
            class="scroll-row -mx-4 flex snap-x snap-mandatory gap-3 px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] md:px-0"
          >
            <li v-for="player in players" :key="player.id" class="card w-36 shrink-0 snap-start p-3 md:w-auto">
              <PlayerCard :player="player" />
            </li>
          </ul>
        </section>

        <section v-if="videos.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">סרטונים</h2>
            <RouterLink to="/media" class="section-link">כל הסרטונים</RouterLink>
          </div>
          <ul class="grid gap-6 sm:grid-cols-2">
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
              <img :src="image.url" :alt="image.title" loading="lazy" class="aspect-square w-full rounded-xl object-cover" />
            </a>
          </div>
        </section>
      </div>

      <aside v-if="hasSocial" class="min-w-0 space-y-4">
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
              ref="fbFrame"
              :src="facebookEmbedSrc"
              title="עמוד הפייסבוק של הקבוצה"
              loading="lazy"
              class="h-[400px] w-full max-w-[500px] rounded-2xl border border-line"
            ></iframe>
            <!-- ponytail: undocumented IG profile embed (IG has no official profile-feed widget; official alternatives are per-post embeds or Graph API) -->
            <iframe
              v-if="instagramUsername"
              :src="`https://www.instagram.com/${instagramUsername}/embed`"
              title="עמוד האינסטגרם של הקבוצה"
              loading="lazy"
              class="h-[400px] w-full rounded-2xl border border-line"
            ></iframe>
            <div v-if="team.twitter_url" :key="team.twitter_url" class="h-[400px] overflow-hidden rounded-2xl border border-line">
              <a class="twitter-timeline" data-height="400" :href="team.twitter_url">הטוויטר של הקבוצה</a>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </section>

  <section v-else class="space-y-2">
    <h1 class="page-title">ברוכים הבאים</h1>
    <p class="text-muted">אין קבוצות במערכת עדיין.</p>
  </section>
</template>
