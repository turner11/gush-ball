<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import LineChart from '../components/LineChart.vue'
import PlayerCard from '../components/PlayerCard.vue'
import PlayerProfileForm from '../components/PlayerProfileForm.vue'
import VideoCard from '../components/VideoCard.vue'
import { canEditTeam, viewer } from '../composables/useAuth'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { gameDayLabel, scoringByPlayer } from '../lib/games'
import { pageTitle, playerJsonLd, setCanonical, setJsonLd } from '../lib/head'
import { DEFAULT_PLAYER_PHOTO, focusStyle, onPlayerImgError } from '../lib/playerPhoto'
import { teamOrigin } from '../lib/site'

const route = useRoute()
const editing = ref(false)
const editButton = ref(null)
const isMine = computed(() => !!player.value && !!viewer.value?.player_ids?.includes(player.value.id))
// A linked player edits their own row; a team admin (unless previewing as a player) edits any row of the team (#468).
const canEdit = computed(() => isMine.value || (!!player.value && canEditTeam(player.value.team_id)))

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
const scoring = ref([]) // this player's scorer rows, oldest game first
const totalPoints = computed(() => scoring.value.reduce((sum, r) => sum + r.points, 0))
const average = computed(() => (totalPoints.value / scoring.value.length).toFixed(1))
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

// API roster order (number, then name), the same order RosterView renders: deliberately not re-sorted.
const teammates = ref([])
const neighbours = computed(() => {
  const i = teammates.value.findIndex((t) => t.id === player.value?.id)
  return i === -1 ? {} : { prev: teammates.value[i - 1], next: teammates.value[i + 1] }
})

const lightbox = ref(null)
const openIndex = ref(null)
const current = computed(() => (openIndex.value == null ? null : images.value[openIndex.value]))
let opener = null // the thumbnail that opened the dialog, refocused on close

function openPhoto(index, event) {
  opener = event.currentTarget
  openIndex.value = index
  lightbox.value.showModal()
}

function step(delta) {
  const n = images.value.length
  openIndex.value = (openIndex.value + delta + n) % n
}

function onLightboxKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const rtl = document.documentElement.dir === 'rtl'
  step((e.key === 'ArrowLeft') === rtl ? 1 : -1)
  e.preventDefault()
}

// Fires for Esc, the close button and dialog.close() alike. Explicit focus: Safari never focuses a clicked button.
function onLightboxClose() {
  openIndex.value = null
  opener?.focus()
}

watch(
  () => route.params.id,
  async (id) => {
    loading.value = true
    error.value = ''
    try {
      const p = await apiFetch(`/players/${id}`)
      const [t, teamImages, teamVideos, teamPlayers, scorerRows, clubList] = await Promise.all([
        apiFetch(`/teams/${p.team_id}`),
        apiFetch(`/teams/${p.team_id}/images`),
        apiFetch(`/teams/${p.team_id}/videos`),
        apiFetch(`/teams/${p.team_id}/players`),
        apiFetch(`/teams/${p.team_id}/games/scorers`),
        apiFetch('/clubs').catch(() => []), // only feeds the canonical: don't blank the page without it
      ])
      if (id !== route.params.id) return // navigated away mid-load: don't clobber the new page's title/JSON-LD
      taggedImages.value = taggedNewestFirst(teamImages, p.id)
      taggedVideos.value = taggedNewestFirst(teamVideos, p.id)
      teammates.value = teamPlayers
      scoring.value = scoringByPlayer(scorerRows).get(p.id) ?? []
      player.value = p
      team.value = t
      document.title = pageTitle(`${p.name} · ${t.name}`, p.name_en)
      const origin = teamOrigin(t, clubList)
      setCanonical(origin + route.path)
      setJsonLd(playerJsonLd(p, t, origin + route.path, `${origin}/${teamSlug(t)}`))
    } catch (e) {
      if (id !== route.params.id) return
      player.value = null
      setJsonLd(null)
      setCanonical(null)
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
          <p v-if="player.is_coach || player.jersey_number != null" class="w-fit rounded-xl bg-team px-3 py-1 text-3xl font-black leading-none tabular-nums text-on-team max-sm:mx-auto sm:text-5xl">
            <template v-if="player.is_coach">מאמן</template>
            <template v-else>#{{ player.jersey_number }}</template>
          </p>
          <h1 class="page-title">{{ player.name }}</h1>
          <p v-if="player.name_en" class="text-lg font-semibold text-muted"><bdi lang="en">{{ player.name_en }}</bdi></p>
          <p v-if="player.minor" class="text-muted">גיל: מתחת 16</p>
          <p v-else-if="player.birth_date" class="text-muted">
            תאריך לידה: <time :datetime="player.birth_date">{{ player.birth_date.split('-').reverse().join('.') }}</time> · גיל {{ player.age }}
          </p>
          <RouterLink :to="'/' + teamSlug(team)" class="section-link">
            <img :src="team.logo_url || '/logo.jpg'" alt="" class="size-8 rounded-lg bg-white object-contain p-0.5" />
            {{ team.name }}
          </RouterLink>
          <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:justify-start">
            <button
              v-if="canEdit"
              ref="editButton"
              type="button"
              class="btn-secondary"
              :aria-expanded="editing"
              aria-controls="profile-form"
              @click="editing = !editing"
            >
              {{ isMine ? 'עריכת הפרופיל שלי' : 'עריכת שחקן' }}
            </button>
            <RouterLink :to="{ name: 'roster', params: { slug: String(player.team_id) } }" class="section-link">כל השחקנים של {{ team.name }}</RouterLink>
          </div>
        </div>
      </header>
      <PlayerProfileForm v-if="canEdit && editing" :player="player" @saved="onSaved" @cancel="closeEditor" />
      <section v-if="scoring.length" class="card space-y-4">
        <h2 class="section-title">סטטיסטיקה</h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="stat">
            <span class="stat-value">{{ scoring.length }}</span>
            <span class="stat-label">משחקים</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ totalPoints }}</span>
            <span class="stat-label">נקודות</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ average }}</span>
            <span class="stat-label">ממוצע למשחק</span>
          </div>
        </div>
        <LineChart
          v-if="scoring.length >= 2"
          :labels="scoring.map((r) => gameDayLabel(r.scheduled_at))"
          :series="[{ key: 'points', name: 'נקודות', values: scoring.map((r) => r.points), emphasis: 'primary' }]"
          :aria-label="`נקודות של ${player.name} לאורך העונה`"
        />
      </section>
      <template v-if="images.length">
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <li v-for="(image, index) in images" :key="image.key">
            <button
              type="button"
              class="card block w-full cursor-zoom-in overflow-hidden"
              :aria-label="`הגדלת תמונה: ${image.alt}`"
              @click="openPhoto(index, $event)"
            >
              <img :src="image.url" :alt="image.alt" loading="lazy" class="aspect-square w-full object-cover object-top" />
            </button>
          </li>
        </ul>
        <dialog
          ref="lightbox"
          aria-label="תמונה בגודל מלא"
          class="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-transparent p-0 text-white backdrop:bg-black/90"
          @close="onLightboxClose"
          @keydown="onLightboxKey"
        >
          <button type="button" class="btn-icon absolute end-2 top-2 z-10 bg-black/50" aria-label="סגירה" @click="lightbox.close()">
            <AppIcon name="close" />
          </button>
          <img v-if="current" :src="current.url" :alt="current.alt" class="size-full object-contain p-4 sm:p-12" />
          <template v-if="images.length > 1">
            <button type="button" class="btn-icon absolute start-2 top-1/2 z-10 -translate-y-1/2 bg-black/50" aria-label="התמונה הקודמת" @click="step(-1)">
              <AppIcon name="chevron" class="size-5 ltr:rotate-90 rtl:-rotate-90" />
            </button>
            <button type="button" class="btn-icon absolute end-2 top-1/2 z-10 -translate-y-1/2 bg-black/50" aria-label="התמונה הבאה" @click="step(1)">
              <AppIcon name="chevron" class="size-5 ltr:-rotate-90 rtl:rotate-90" />
            </button>
            <p class="absolute inset-x-0 bottom-3 text-center text-sm font-semibold tabular-nums" aria-live="polite">
              {{ openIndex + 1 }} / {{ images.length }}
            </p>
          </template>
        </dialog>
      </template>
      <div v-else-if="canEdit" class="empty-state space-y-3">
        <p>{{ isMine ? 'עדיין אין תמונות בפרופיל שלך.' : 'עדיין אין תמונות לשחקן.' }}</p>
        <button v-if="!editing" type="button" class="btn-primary" aria-controls="profile-form" @click="editing = true">הוספת תמונות</button>
      </div>
      <p v-else class="text-sm text-muted">אין תמונות עדיין.</p>
      <section v-if="videos.length || canEdit" class="space-y-2">
        <h2 class="section-title">סרטונים</h2>
        <ul v-if="videos.length" class="grid gap-6 sm:grid-cols-2">
          <li v-for="video in videos" :key="video.key"><VideoCard :video="video" /></li>
        </ul>
        <div v-else class="empty-state space-y-3">
          <p>{{ isMine ? 'עדיין אין סרטונים בפרופיל שלך.' : 'עדיין אין סרטונים לשחקן.' }}</p>
          <button v-if="!editing" type="button" class="btn-primary" aria-controls="profile-form" @click="editing = true">הוספת סרטון</button>
        </div>
      </section>
      <nav v-if="neighbours.prev || neighbours.next" aria-label="ניווט בין שחקני הקבוצה" class="card flex items-center justify-between gap-4">
        <RouterLink
          v-if="neighbours.prev"
          :to="`/players/${neighbours.prev.id}`"
          :aria-label="`השחקן הקודם: ${neighbours.prev.name}`"
          class="flex min-h-11 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-sunken"
        >
          <span class="eyebrow" aria-hidden="true">→ הקודם</span>
          <div class="w-20"><PlayerCard :player="neighbours.prev" compact /></div>
        </RouterLink>
        <RouterLink
          v-if="neighbours.next"
          :to="`/players/${neighbours.next.id}`"
          :aria-label="`השחקן הבא: ${neighbours.next.name}`"
          class="ms-auto flex min-h-11 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-sunken"
        >
          <div class="w-20"><PlayerCard :player="neighbours.next" compact /></div>
          <span class="eyebrow" aria-hidden="true">הבא ←</span>
        </RouterLink>
      </nav>
    </template>
    <p v-else class="empty-state">{{ error }}</p>
  </section>
</template>
