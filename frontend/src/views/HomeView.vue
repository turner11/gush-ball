<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import GameLocationLinks from '../components/GameLocationLinks.vue'
import GameScoreboard from '../components/GameScoreboard.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import PlayerCard from '../components/PlayerCard.vue'
import VideoCard from '../components/VideoCard.vue'
import WikipediaCard from '../components/WikipediaCard.vue'
import { canEditTeam } from '../composables/useAuth'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { gameAddress, played, splitGames } from '../lib/games'
import { CONTENT_SECTIONS } from '../lib/teamContent'

const team = ref(null)
// Path strings, not named routes: this view also renders on the slug-less home route.
const base = computed(() => (team.value ? '/' + teamSlug(team.value) : ''))
const links = ref([])
const videos = ref([])
const images = ref([])
const posts = ref([])
const players = ref([])
const games = ref([])
const loading = ref(false)

// Inline editors for the about text and the links (#471); both close on a team switch or when the preview turns on.
const canEdit = computed(() => !!team.value && canEditTeam(team.value.id))
const editingAbout = ref(false)
const editingLinks = ref(false)
const aboutDraft = ref('')
const savingAbout = ref(false)
const aboutError = ref(null)
const aboutToggle = ref(null)
const linksToggle = ref(null)
const closeEditors = () => {
  editingAbout.value = false
  editingLinks.value = false
}
watch(canEdit, (can) => {
  if (!can) closeEditors()
})

function toggleAbout() {
  editingAbout.value = !editingAbout.value
  aboutDraft.value = team.value.about ?? ''
  aboutError.value = null
}

async function cancelAbout() {
  editingAbout.value = false
  await nextTick()
  aboutToggle.value?.focus()
}

async function saveAbout() {
  savingAbout.value = true
  aboutError.value = null
  try {
    team.value = await apiFetch(`/teams/${team.value.id}`, { method: 'PATCH', body: { about: aboutDraft.value.trim() || null } })
    editingAbout.value = false
    await nextTick()
    aboutToggle.value?.focus()
  } catch {
    aboutError.value = 'שגיאה בשמירה, נסו שוב'
  } finally {
    savingAbout.value = false
  }
}

async function toggleLinks() {
  if (!editingLinks.value) {
    editingLinks.value = true
    return
  }
  editingLinks.value = false
  try {
    links.value = await apiFetch(`/teams/${team.value.id}/links`)
  } catch {
    // keep the old list rather than blanking it
  }
  await nextTick()
  linksToggle.value?.focus()
}

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId, teamsLoaded } = useSelectedTeam()

async function load() {
  closeEditors()
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
    const loaded = await Promise.all([
      apiFetch(`/teams/${id}`),
      apiFetch(`/teams/${id}/links`),
      apiFetch(`/teams/${id}/videos`),
      apiFetch(`/teams/${id}/images`),
      apiFetch(`/teams/${id}/posts`),
      apiFetch(`/teams/${id}/players`),
      apiFetch(`/teams/${id}/games`),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    ;[team.value, links.value, videos.value, images.value, posts.value, players.value, games.value] = loaded
  } finally {
    if (id === selectedTeamId.value) loading.value = false
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

const lone = computed(() => matchCards.value.length === 1)

const topPost = computed(() => posts.value[0] ?? null) // API order: pinned first, then newest

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

function firstPathSegment(url) {
  if (!url) return null
  try {
    return new URL(url).pathname.split('/').filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

const instagramUsername = computed(() => firstPathSegment(team.value?.instagram_url))
const twitterHandle = computed(() => firstPathSegment(team.value?.twitter_url))

const hasSocial = computed(() => {
  const t = team.value
  return !!(t && (t.facebook_url || t.instagram_url || t.youtube_url || t.tiktok_url || t.twitter_url || t.wikipedia_url))
})

const hasSocialEmbed = computed(
  () => !!(team.value && (team.value.facebook_url || instagramUsername.value || twitterHandle.value)),
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
            <GameScoreboard :game="m.game" :team="team" :large="lone" />
            <div class="mt-auto flex flex-wrap items-center gap-2 text-sm text-muted">
              <!-- an unplayed game already shows its date in the middle -->
              <span v-if="played(m.game)">{{ formatDateTime(m.game.scheduled_at) }}</span>
              <GameLocationLinks v-if="gameAddress(m.game, team)" :address="gameAddress(m.game, team)" />
              <RouterLink :to="`${base}/games/${m.game.id}`" class="section-link ms-auto" :aria-label="'פרטי המשחק נגד ' + m.game.opponent.name">פרטי המשחק</RouterLink>
              <RouterLink :to="base + '/schedule'" class="section-link">ללוח המשחקים</RouterLink>
            </div>
          </div>
        </div>

        <section v-if="team.about || canEdit" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">על הקבוצה</h2>
            <button v-if="canEdit" ref="aboutToggle" type="button" class="btn-secondary" aria-controls="home-about-editor" :aria-expanded="editingAbout" @click="toggleAbout">{{ editingAbout ? 'סגירה' : 'עריכה' }}</button>
          </div>
          <form v-if="editingAbout" id="home-about-editor" class="card space-y-3" @submit.prevent="saveAbout">
            <div>
              <label for="home-about" class="field-label">על הקבוצה</label>
              <textarea id="home-about" v-model="aboutDraft" class="field-input" rows="6" maxlength="5000" />
              <p class="mt-1 text-sm text-muted">השאירו ריק כדי להסתיר.</p>
            </div>
            <p v-if="aboutError" class="error-text" role="alert">{{ aboutError }}</p>
            <div class="flex flex-wrap gap-3">
              <button type="submit" class="btn-primary" :disabled="savingAbout">שמירה</button>
              <button type="button" class="btn-secondary" @click="cancelAbout">ביטול</button>
            </div>
          </form>
          <div v-else-if="team.about" class="card"><p class="max-w-prose whitespace-pre-line break-words">{{ team.about }}</p></div>
          <p v-else class="empty-state">עוד אין טקסט על הקבוצה.</p>
        </section>

        <section v-if="topPost" class="space-y-3">
          <div class="section-header">
            <h2 class="section-title">עדכונים</h2>
            <RouterLink :to="base + '/media'" class="section-link">כל העדכונים</RouterLink>
          </div>
          <article class="card space-y-1">
            <div class="flex items-center gap-2">
              <h3 class="min-w-0 text-lg font-extrabold">{{ topPost.title }}</h3>
              <span v-if="topPost.pinned" class="badge badge-muted shrink-0">נעוץ</span>
            </div>
            <p class="line-clamp-6 max-w-prose whitespace-pre-line text-muted">{{ topPost.body }}</p>
          </article>
        </section>

        <section v-if="players.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">שחקנים</h2>
            <RouterLink :to="base + '/roster'" class="section-link">כל השחקנים</RouterLink>
          </div>
          <!-- swipe row on touch widths; from md a wrapping grid (mouse users can't scroll a hidden-scrollbar row) -->
          <ul
            class="scroll-row -mx-4 flex snap-x snap-mandatory gap-3 px-4 pb-2 sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] md:px-0"
          >
            <li v-for="player in players" :key="player.id" class="card w-36 shrink-0 snap-start p-3 md:w-auto relative overflow-hidden">
              <PlayerCard :player="player" :team-images="images" />
            </li>
          </ul>
        </section>

        <section v-if="videos.length" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">סרטונים</h2>
            <RouterLink :to="base + '/media'" class="section-link">כל הסרטונים</RouterLink>
          </div>
          <ul class="grid gap-6 sm:grid-cols-2">
            <li v-for="video in latestVideos" :key="video.id">
              <VideoCard :video="video" />
            </li>
          </ul>
        </section>

        <section v-if="links.length || canEdit" class="space-y-2">
          <div class="section-header">
            <h2 class="section-title">קישורים</h2>
            <button v-if="canEdit" ref="linksToggle" type="button" class="btn-secondary" aria-controls="home-links-editor" :aria-expanded="editingLinks" @click="toggleLinks">{{ editingLinks ? 'סיום עריכה' : 'עריכת קישורים' }}</button>
          </div>
          <TeamContentSection v-if="editingLinks" id="home-links-editor" :key="team.id" :team-id="team.id" v-bind="CONTENT_SECTIONS.links" />
          <p v-else-if="!links.length" class="empty-state">אין קישורים עדיין.</p>
          <ul v-else class="flex flex-wrap gap-2">
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
          <a v-if="team.wikipedia_url" :href="team.wikipedia_url" target="_blank" rel="noopener" class="btn-secondary">ויקיפדיה</a>
        </div>

        <WikipediaCard v-if="team.wikipedia_url" :key="team.wikipedia_url" :url="team.wikipedia_url" />

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
            <!-- ponytail: the iframe page widgets.js would create, loaded directly so no X script runs in our origin (undocumented by X) -->
            <iframe
              v-if="twitterHandle"
              :src="`https://syndication.twitter.com/srv/timeline-profile/screen-name/${twitterHandle}`"
              title="הטוויטר של הקבוצה"
              loading="lazy"
              class="h-[400px] w-full rounded-2xl border border-line"
            ></iframe>
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
