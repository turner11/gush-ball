<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import GameAverages from '../components/GameAverages.vue'
import ImageGallery from '../components/ImageGallery.vue'
import LoadError from '../components/LoadError.vue'
import PostCard from '../components/PostCard.vue'
import GameMediaEditor from '../components/GameMediaEditor.vue'
import GameLocationLinks from '../components/GameLocationLinks.vue'
import GameScorersEditor from '../components/GameScorersEditor.vue'
import GameScoreboard from '../components/GameScoreboard.vue'
import GameStatsEditor from '../components/GameStatsEditor.vue'
import GameStatsRowsEditor from '../components/GameStatsRowsEditor.vue'
import GameStatsLink from '../components/GameStatsLink.vue'
import VideoCard from '../components/VideoCard.vue'
import { canEditTeam } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { gameAddress, played, STATUS_LABELS } from '../lib/games'

const route = useRoute()
const { selectedTeamId, teamsLoaded } = useSelectedTeam()
const team = ref(null)
const game = ref(null)
const posts = ref([])
const loading = ref(true)
const notFound = ref(false)
const loadError = ref(false)

const scheduleRoute = computed(() => ({ name: 'schedule', params: { slug: route.params.slug } }))
const canEdit = computed(() => !!game.value && canEditTeam(game.value.team_id))
const { editing: editingScorers, toggleEl: scorersToggle, toggle: toggleScorers } = useInlineEditor(canEdit)
const { editing: editingMedia, toggleEl: mediaToggle, toggle: toggleMedia } = useInlineEditor(canEdit)
const { editing: editingStats, toggleEl: statsToggle, toggle: toggleStats } = useInlineEditor(canEdit)
const hasMedia = computed(() => !!(game.value?.videos?.length || game.value?.images?.length))
const gamePosts = computed(() => posts.value.filter((p) => p.game_id === game.value?.id))
const address = computed(() => gameAddress(game.value, team.value))

const statsEditor = ref(null)
const rowsEditor = ref(null)
const rowsKey = ref(0) // bumped when a sheet load or delete changed the rows on the server, so the table reloads
function onStatsChange(e) {
  Object.assign(game.value, e)
  if ('has_stats' in e) rowsKey.value++
}
const saved = ref(null) // 'scorers' | 'media' | 'stats' | 'stats-removed': which save to confirm (the editor unmounts on save)
watch(editingScorers, (open) => open && (saved.value = null))
watch(editingMedia, (open) => open && (saved.value = null))
watch(editingStats, (open) => open && (saved.value = null))

// Ending the edit saves a changed sheet link first; a rejected link keeps the editor open.
const savingStats = ref(false) // blocks a second click (the disabled button only lands after the next render)
async function toggleStatsEditor() {
  if (savingStats.value) return
  if (editingStats.value) {
    const before = game.value.stats_url
    savingStats.value = true
    const ok = await statsEditor.value.saveUrl()
    const rowsOk = ok && (await rowsEditor.value.save())
    savingStats.value = false
    if (!ok || !rowsOk) return
    if (game.value.stats_url !== before) saved.value = game.value.stats_url ? 'stats' : 'stats-removed'
  }
  toggleStats()
}

function onScorersSaved(list) {
  game.value.scorers = list
  saved.value = 'scorers'
  toggleScorers()
}

function onMediaSaved(media) {
  game.value.videos = media.videos
  game.value.images = media.images
  saved.value = 'media'
  toggleMedia()
}

// DefaultLayout resolves the slug to selectedTeamId; fetching before that would use a stale remembered team.
async function load() {
  if (!teamsLoaded.value) return
  notFound.value = loadError.value = false
  if (!selectedTeamId.value) {
    // /teams failed or is empty: nothing to fetch, so end loading instead of showing the skeleton forever
    notFound.value = true
    loading.value = false
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    // ponytail: fetches all the team's posts and filters client-side; add a ?game_id= filter if post counts grow.
    // Posts are secondary, so a failed fetch means no posts, not a failed page.
    const loaded = await Promise.all([
      apiFetch(`/teams/${id}`),
      apiFetch(`/teams/${id}/games/${route.params.id}`),
      apiFetch(`/teams/${id}/posts`).catch(() => []),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    ;[team.value, game.value, posts.value] = loaded
  } catch (e) {
    if (id !== selectedTeamId.value) return
    game.value = null
    if (e.status === 404) notFound.value = true
    else loadError.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
  // scrollBehavior runs before the game has loaded, so reveal a #post-<id> link target here
  if (game.value && id === selectedTeamId.value && route.hash) {
    await nextTick()
    document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }
}

watch([selectedTeamId, teamsLoaded, () => route.params.id], load, { immediate: true })
</script>

<template>
  <h1 v-if="loading || !game" class="sr-only">משחק</h1>
  <div v-if="loading" class="mx-auto max-w-3xl space-y-6" aria-busy="true">
    <div class="skeleton h-48" />
    <div class="skeleton h-24" />
  </div>

  <div v-else-if="notFound" class="mx-auto max-w-3xl space-y-3">
    <p class="empty-state">המשחק לא נמצא.</p>
    <RouterLink :to="scheduleRoute" class="section-link">ללוח המשחקים</RouterLink>
  </div>

  <LoadError v-else-if="loadError" class="mx-auto max-w-3xl" message="שגיאה בטעינת המשחק" @retry="load" />

  <div v-else-if="game" class="mx-auto max-w-3xl space-y-6">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ team.name }}</p>
        <h1 class="page-title">נגד {{ game.opponent.name }}</h1>
      </div>
      <RouterLink :to="scheduleRoute" class="section-link">ללוח המשחקים</RouterLink>
    </header>

    <section class="card sm:p-8">
      <GameScoreboard :game="game" :team="team" large />
    </section>

    <section class="card space-y-4">
      <dl class="space-y-3 sm:grid sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-3 sm:space-y-0">
        <dt class="font-bold text-muted">מועד</dt>
        <dd class="flex flex-wrap items-center gap-2">
          {{ formatDateTime(game.scheduled_at) }}
          <span class="badge badge-muted">{{ game.is_home ? 'בית' : 'חוץ' }}</span>
          <span v-if="!played(game)" class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span>
        </dd>
        <template v-if="address">
          <dt class="font-bold text-muted">מקום</dt>
          <dd class="space-y-2">
            <p class="break-words">{{ address }}</p>
            <GameLocationLinks :address="address" />
          </dd>
        </template>
      </dl>
      <GameStatsLink :game="game" class="btn-secondary" />
    </section>

    <section v-if="game.description" class="card space-y-2">
      <h2 class="section-title">על המשחק</h2>
      <p class="max-w-prose whitespace-pre-line">{{ game.description }}</p>
    </section>

    <section v-if="game.scorers?.length || canEdit" class="card space-y-3">
      <div class="section-header flex-wrap">
        <h2 class="section-title">קלעים</h2>
        <p v-if="canEdit" aria-live="polite" data-test="scorers-saved" class="ms-auto text-sm text-muted">{{ saved === 'scorers' ? 'הקלעים נשמרו' : '' }}</p>
        <button
          v-if="canEdit"
          ref="scorersToggle"
          type="button"
          class="btn-secondary"
          aria-controls="game-scorers-editor"
          :aria-expanded="editingScorers"
          @click="toggleScorers"
        >
          {{ editingScorers ? 'סיום עריכה' : 'עריכת קלעים' }}
        </button>
      </div>
      <GameScorersEditor v-if="editingScorers" id="game-scorers-editor" :team-id="game.team_id" :game-id="game.id" @saved="onScorersSaved" />
      <ol v-else-if="game.scorers?.length" class="divide-y divide-line">
        <li v-for="s in game.scorers" :key="s.player_id" class="flex min-h-11 items-center gap-3">
          <span class="w-8 shrink-0 tabular-nums text-muted">{{ s.jersey_number != null ? `#${s.jersey_number}` : '' }}</span>
          <RouterLink :to="{ name: 'player', params: { id: s.player_id } }" class="min-w-0 flex-1 break-words">{{ s.name }}</RouterLink>
          <span class="text-lg font-black tabular-nums">{{ s.points }}</span>
        </li>
      </ol>
      <p v-else class="empty-state">עדיין לא הוזנו קלעים.</p>
    </section>

    <section v-if="canEdit" class="card space-y-3">
      <div class="section-header flex-wrap">
        <h2 class="section-title">סטטיסטיקת חמישיות</h2>
        <p aria-live="polite" data-test="stats-saved" class="ms-auto text-sm text-muted">{{ { stats: 'הקישור לגיליון נשמר', 'stats-removed': 'הקישור לגיליון הוסר' }[saved] ?? '' }}</p>
        <button
          ref="statsToggle"
          type="button"
          class="btn-secondary"
          aria-controls="game-stats-editor"
          :aria-expanded="editingStats"
          :disabled="savingStats"
          @click="toggleStatsEditor"
        >
          {{ editingStats ? 'סיום עריכה' : 'ניהול סטטיסטיקה' }}
        </button>
      </div>
      <div v-if="editingStats" id="game-stats-editor" class="space-y-6">
        <GameStatsEditor ref="statsEditor" :team-id="game.team_id" :game="game" @change="onStatsChange" />
        <GameStatsRowsEditor ref="rowsEditor" :key="rowsKey" :team-id="game.team_id" :game-id="game.id" :has-stats="game.has_stats" @saved="Object.assign(game, $event)" />
      </div>
      <p v-else class="text-sm text-muted">{{ game.has_stats ? 'הנתונים נטענו.' : 'עדיין לא נטענו נתונים.' }}</p>
    </section>

    <GameAverages :team="team" :opponent="game.opponent" :game-id="game.id" />

    <section v-if="gamePosts.length" class="space-y-3" aria-labelledby="game-posts-title">
      <h2 id="game-posts-title" class="sr-only">עדכונים</h2>
      <PostCard v-for="post in gamePosts" :key="post.id" :post="post" />
    </section>

    <section v-if="hasMedia || canEdit" class="card space-y-3">
      <div class="section-header flex-wrap">
        <h2 class="section-title">מדיה</h2>
        <p v-if="canEdit" aria-live="polite" data-test="media-saved" class="ms-auto text-sm text-muted">{{ saved === 'media' ? 'המדיה נשמרה' : '' }}</p>
        <button
          v-if="canEdit"
          ref="mediaToggle"
          type="button"
          class="btn-secondary"
          aria-controls="game-media-editor"
          :aria-expanded="editingMedia"
          @click="toggleMedia"
        >
          {{ editingMedia ? 'סיום עריכה' : 'עריכת מדיה' }}
        </button>
      </div>
      <GameMediaEditor v-if="editingMedia" id="game-media-editor" :team-id="game.team_id" :game-id="game.id" @saved="onMediaSaved" />
      <template v-else-if="hasMedia">
        <ul v-if="game.videos?.length" class="grid gap-6 sm:grid-cols-2">
          <li v-for="(v, i) in game.videos" :key="i"><VideoCard :video="v" /></li>
        </ul>
        <ImageGallery v-if="game.images?.length" :images="game.images" :fallback-alt="'נגד ' + game.opponent.name" />
      </template>
      <p v-else class="empty-state">עדיין לא נוספו סרטונים או תמונות.</p>
    </section>
  </div>
</template>
