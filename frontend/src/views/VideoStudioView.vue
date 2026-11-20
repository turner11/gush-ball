<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import LoadError from '../components/LoadError.vue'
import StudioClipEditor from '../components/StudioClipEditor.vue'
import StudioShortcuts from '../components/StudioShortcuts.vue'
import YouTubePlayer from '../components/YouTubePlayer.vue'
import { previewMode } from '../composables/useAuth'
import { useClipStudio } from '../composables/useClipStudio'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { momentRange, needsGame, nudge, studioAction, studioPrefs } from '../lib/clips'
import { formatTimestamp, withVideoSegment, youtubeId } from '../lib/youtube'

const route = useRoute()
const { selectedTeamId, teamsLoaded } = useSelectedTeam()
const team = ref(null)
const game = ref(null)
const roster = ref([]) // players, coaches excluded: the ones a clip can be tagged with
const loading = ref(true)
const notFound = ref(false)
const loadError = ref(false)

// The studio of one game (/:slug/games/:id/studio) or of the team's game-less clips (/:slug/studio, P only).
const gameId = computed(() => (route.params.id ? Number(route.params.id) : null))
const canEdit = ref(false)
const gameRoute = computed(() => ({ name: 'game', params: { slug: route.params.slug, id: route.params.id } }))
const scheduleRoute = computed(() => ({ name: 'schedule', params: { slug: route.params.slug } }))
const teamRoute = computed(() => ({ name: 'team-home', params: { slug: route.params.slug } }))
const teamStudioRoute = computed(() => ({ name: 'team-studio', params: { slug: route.params.slug } }))
const allowed = computed(() => canEdit.value && !previewMode.value)

// Shortcuts panel, larger-video mode and moment window, kept in this browser (#683).
const PREFS_KEY = 'gush-ball:studio'
function loadPrefs() {
  try {
    return studioPrefs(JSON.parse(localStorage.getItem(PREFS_KEY)))
  } catch {
    return studioPrefs({})
  }
}
const prefs = reactive(loadPrefs())
watch(prefs, () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // storage blocked: the prefs last for this visit
  }
})

const { clips, selected, sections, lastDeleted, load: loadClips, add, change, remove, undo, select } = useClipStudio(
  computed(() => selectedTeamId.value),
  gameId,
)

async function load() {
  if (!teamsLoaded.value) return
  notFound.value = loadError.value = false
  if (!selectedTeamId.value) {
    notFound.value = true
    loading.value = false
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const [loadedTeam, loadedGame, players] = await Promise.all([
      apiFetch(`/teams/${id}`),
      gameId.value ? apiFetch(`/teams/${id}/games/${gameId.value}`) : null,
      apiFetch(`/teams/${id}/players`),
    ])
    let editable = loadedGame ? !!loadedGame.can_edit_briefing : true // a team's studio: the clips list itself says
    try {
      if (editable) await loadClips() // the clips list is for editors only
    } catch (e) {
      if (e.status !== 403 || loadedGame) throw e
      editable = false
    }
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    team.value = loadedTeam
    game.value = loadedGame
    canEdit.value = editable
    roster.value = players.filter((p) => !p.is_coach)
    activeUrl.value = loadedGame?.video_urls?.[0] ?? (youtubeId(selected.value?.source_url) ? selected.value.source_url : '')
  } catch (e) {
    if (id !== selectedTeamId.value) return
    team.value = game.value = null
    if (e.status === 404) notFound.value = true
    else loadError.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}
watch([selectedTeamId, teamsLoaded, gameId], load, { immediate: true })

// --- the video ---
const player = useTemplateRef('player')
const editor = useTemplateRef('editor')
const activeUrl = ref('')
const playerKey = ref(0) // bumped to remount the player after it failed
const playerFailed = ref(false)
const pasted = ref('')
const pasteError = ref('')

function showVideo(url, start = 0) {
  activeUrl.value = url
  player.value?.load(url, start)
}
function pickPasted() {
  if (!youtubeId(pasted.value)) {
    pasteError.value = 'הדביקו קישור YouTube תקין'
    return
  }
  pasteError.value = ''
  showVideo(pasted.value.trim())
  pasted.value = ''
}
const rate = ref(1) // the player's playback rate, as it reports it
function onRateChange(r) {
  rate.value = r
  status.value = `מהירות ×${r}`
}
function seekBy(delta) {
  if (!activeUrl.value) return
  player.value?.seek(Math.max(0, (player.value.currentTime() ?? 0) + delta))
}
function retryPlayer() {
  playerFailed.value = false
  playerKey.value++
}

// --- the clips ---
const ts = (seconds) => (seconds === null ? '--:--' : formatTimestamp(seconds))
const status = ref('') // the one live-region line: what the last action did
const jerseyBuffer = ref('')
const jerseyError = ref('')
const clearJersey = () => (jerseyBuffer.value = jerseyError.value = '')

const sourceLabel = (clip) => {
  if (!clip.source_url) return 'הערה'
  const i = game.value?.video_urls?.indexOf(clip.source_url) ?? -1
  return i >= 0 ? `סרטון ${i + 1}` : 'קישור'
}
const range = (clip) => `${ts(clip.start)}–${ts(clip.end)}`
const tagged = (clip) => roster.value.filter((p) => clip.player_ids.includes(p.id))

function selectClip(clip) {
  select(clip)
  if (youtubeId(clip.source_url)) showVideo(clip.source_url, clip.start ?? 0)
}

function addMoment() {
  if (!activeUrl.value) return
  const { before, after } = studioPrefs(prefs) // a half-typed input never yields NaN
  const moment = momentRange(player.value?.currentTime() ?? 0, before, after)
  add({ source_url: withVideoSegment(activeUrl.value, null, null), ...moment })
  status.value = `נוסף קטע ${range(moment)}`
}

// I / O: the selected clip's start or end at the current time; with none selected, a new clip begins there.
function markBound(which) {
  if (!activeUrl.value) return
  const now = Math.floor(player.value?.currentTime() ?? 0)
  // a clip of another video is not the one on screen: its bounds would take this video's time
  const clip = youtubeId(selected.value?.source_url) === youtubeId(activeUrl.value) ? selected.value : null
  if (!clip) {
    add({ source_url: withVideoSegment(activeUrl.value, null, null), [which]: now })
  } else {
    const other = which === 'start' ? 'end' : 'start'
    const crossed = clip[other] !== null && (which === 'start' ? clip.end <= now : now <= clip.start)
    change(clip, { [which]: now, ...(crossed && { [other]: null }) })
  }
  status.value = `${which === 'start' ? 'התחלה' : 'סוף'} ${ts(now)}`
}

function nudgeSelected(which, delta) {
  const next = selected.value && nudge(selected.value, which, delta)
  if (next) change(selected.value, next)
}

function toggleDestination(field) {
  if (!selected.value || (needsGame(field) && selected.value.game_id === null)) return
  change(selected.value, { [field]: !selected.value[field] })
}

function confirmJersey() {
  if (!jerseyBuffer.value || !selected.value) return
  const number = Number(jerseyBuffer.value)
  const match = roster.value.find((p) => p.jersey_number === number)
  if (!match) {
    jerseyError.value = `אין שחקן עם מספר ${number}`
    return
  }
  const ids = selected.value.player_ids
  change(selected.value, { player_ids: ids.includes(match.id) ? ids.filter((i) => i !== match.id) : [...ids, match.id] })
  clearJersey()
}

async function deleteSelected() {
  if (!selected.value) return
  await remove(selected.value)
  status.value = 'הקטע נמחק'
}

const HANDLERS = {
  toggle: () => player.value?.toggle(),
  seek: (a) => seekBy(a.delta),
  rate: (a) => player.value?.stepRate(a.step),
  moment: addMoment,
  markStart: () => markBound('start'),
  markEnd: () => markBound('end'),
  toggleHighlight: () => toggleDestination('is_highlight'),
  toggleBriefing: () => toggleDestination('in_game_briefing'),
  togglePlayer: () => toggleDestination('in_player_briefing'),
  shortcuts: () => (prefs.shortcutsOpen = !prefs.shortcutsOpen),
  focusSection: () => editor.value?.focusSection(),
  delete: deleteSelected,
  confirm: confirmJersey,
  cancel: clearJersey,
  nudgeStart: (a) => nudgeSelected('start', a.delta),
  nudgeEnd: (a) => nudgeSelected('end', a.delta),
  digit: (a) => {
    jerseyError.value = ''
    jerseyBuffer.value = (jerseyBuffer.value + a.digit).slice(0, 3)
  },
}
function onKeydown(event) {
  const action = allowed.value && !loading.value ? studioAction(event) : null
  if (!action) return
  event.preventDefault() // Space must not scroll the page, S must not type into the field it focuses
  HANDLERS[action.name](action)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// The undo toast hides itself.
let toastTimer = null
watch(lastDeleted, (value) => {
  clearTimeout(toastTimer)
  if (value) toastTimer = setTimeout(() => (lastDeleted.value = null), 8000)
})
onBeforeUnmount(() => clearTimeout(toastTimer))
</script>

<template>
  <h1 v-if="loading || !team" class="sr-only">סטודיו וידאו</h1>
  <div v-if="loading" class="space-y-4" aria-busy="true">
    <div class="skeleton aspect-video w-full"></div>
    <div class="skeleton h-40"></div>
  </div>

  <div v-else-if="notFound" class="mx-auto max-w-3xl space-y-3">
    <p class="empty-state">{{ gameId ? 'המשחק לא נמצא.' : 'הקבוצה לא נמצאה.' }}</p>
    <RouterLink :to="gameId ? scheduleRoute : { name: 'teams' }" class="section-link">{{ gameId ? 'ללוח המשחקים' : 'לכל הקבוצות' }}</RouterLink>
  </div>

  <LoadError v-else-if="loadError" class="mx-auto max-w-3xl" message="שגיאה בטעינת הסטודיו" @retry="load" />

  <div v-else-if="team && !allowed" class="mx-auto max-w-3xl space-y-3">
    <p class="empty-state">הסטודיו פתוח למנהלי הקבוצה ולמאמן</p>
    <RouterLink :to="game ? gameRoute : teamRoute" class="section-link">{{ game ? 'לעמוד המשחק' : 'לעמוד הקבוצה' }}</RouterLink>
  </div>

  <div v-else-if="team">
    <header class="page-header">
      <div>
        <p class="eyebrow">{{ team.name }}</p>
        <h1 class="page-title">{{ game ? `סטודיו · נגד ${game.opponent.name}` : 'סטודיו וידאו' }}</h1>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn-ghost"
          aria-controls="studio-shortcuts"
          aria-keyshortcuts="Shift+?"
          :aria-expanded="prefs.shortcutsOpen"
          @click="prefs.shortcutsOpen = !prefs.shortcutsOpen"
        >
          קיצורי מקלדת <kbd class="kbd">?</kbd>
        </button>
        <RouterLink v-if="game" :to="teamStudioRoute" class="section-link">סטודיו קבוצתי</RouterLink>
        <RouterLink :to="game ? gameRoute : teamRoute" class="section-link">{{ game ? 'לעמוד המשחק' : 'לעמוד הקבוצה' }}</RouterLink>
      </div>
    </header>

    <div class="space-y-6" :class="!prefs.theater && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 lg:space-y-0'">
      <div class="min-w-0 space-y-4">
        <div class="flex flex-wrap items-start gap-3">
          <div v-if="game?.video_urls?.length" class="segmented flex-wrap" role="group" aria-label="סרטון משחק">
            <button
              v-for="(url, i) in game.video_urls"
              :key="url"
              type="button"
              class="segmented-item"
              :aria-pressed="activeUrl === url"
              @click="showVideo(url)"
            >
              סרטון {{ i + 1 }}
            </button>
          </div>
          <form class="flex min-w-0 grow flex-wrap items-start gap-2" @submit.prevent="pickPasted">
            <div class="min-w-48 grow">
              <label for="studio-url" class="sr-only">קישור YouTube</label>
              <input id="studio-url" v-model="pasted" class="field-input mt-0" type="url" dir="ltr" placeholder="https://www.youtube.com/watch?v=…" />
              <p v-if="pasteError" class="error-text mt-1" role="alert">{{ pasteError }}</p>
            </div>
            <button type="submit" class="btn-secondary">טעינה</button>
          </form>
        </div>

        <template v-if="activeUrl">
          <div v-if="playerFailed" class="mx-auto aspect-video w-full space-y-3 lg:max-w-[calc((100dvh-9rem)*16/9)] rounded-2xl border border-line bg-sunken p-6">
            <p class="error-text" role="alert">הנגן לא נטען</p>
            <button type="button" class="btn-secondary" @click="retryPlayer">נסו שוב</button>
          </div>
          <YouTubePlayer v-else ref="player" :key="playerKey" :url="activeUrl" class="mx-auto lg:max-w-[calc((100dvh-9rem)*16/9)]" @error="playerFailed = true" @ratechange="onRateChange" />
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-secondary" aria-keyshortcuts="Space" @click="player?.toggle()">ניגון / השהיה <kbd class="kbd">Space</kbd></button>
            <button type="button" class="btn-primary" aria-keyshortcuts="M" @click="addMoment">סימון רגע <kbd class="kbd">M</kbd></button>
            <button type="button" class="btn-secondary" aria-keyshortcuts="I" @click="markBound('start')">התחלה כאן <kbd class="kbd">I</kbd></button>
            <button type="button" class="btn-secondary" aria-keyshortcuts="O" @click="markBound('end')">סוף כאן <kbd class="kbd">O</kbd></button>
            <button type="button" class="btn-ghost hidden lg:inline-flex" :aria-pressed="prefs.theater" @click="prefs.theater = !prefs.theater">וידאו גדול</button>
            <span class="badge-muted self-center">מהירות <span dir="ltr" class="tabular-nums">×{{ rate }}</span></span>
          </div>
        </template>
        <p v-else class="empty-state">{{ game ? 'הוסיפו צילומי משחק בעמוד המשחק או הדביקו קישור YouTube' : 'הדביקו קישור YouTube: סקאוטינג, עונה קודמת או כל סרטון' }}</p>
        <p class="text-sm text-muted" aria-live="polite" data-test="status">{{ status }}</p>
      </div>

      <div class="min-w-0 space-y-4" :class="prefs.theater && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0'">
        <StudioShortcuts v-if="prefs.shortcutsOpen" v-model:before="prefs.before" v-model:after="prefs.after" :with-game="!!game" />
        <section class="card" aria-label="הקטע הנבחר">
          <StudioClipEditor
            v-if="selected"
            ref="editor"
            :clip="selected"
            :roster="roster"
            :sections="sections"
            :jersey-buffer="jerseyBuffer"
            :jersey-error="jerseyError"
            @change="change(selected, $event)"
            @delete="deleteSelected"
          />
          <p v-else class="empty-state border-0 py-6">בחרו קטע מהרשימה או סמנו רגע חדש.</p>
        </section>

        <section class="space-y-2" aria-labelledby="studio-clips-title">
          <h2 id="studio-clips-title" class="section-title">קטעים <span class="badge-muted">{{ clips.length }}</span></h2>
          <p v-if="!clips.length" class="empty-state">לחצו M כדי לסמן רגע</p>
          <ol v-else class="space-y-2">
            <li v-for="clip in clips" :key="clip.uid">
              <button
                type="button"
                class="card flex w-full flex-wrap items-center gap-2 text-start"
                :class="selected?.uid === clip.uid && 'ring-2 ring-team'"
                :aria-current="selected?.uid === clip.uid ? 'true' : undefined"
                @click="selectClip(clip)"
              >
                <span class="font-bold tabular-nums" dir="ltr">{{ range(clip) }}</span>
                <span class="text-sm text-muted">{{ sourceLabel(clip) }}</span>
                <span v-if="clip.is_highlight" class="badge-muted">H</span>
                <span v-if="clip.in_game_briefing" class="badge-muted">B</span>
                <span v-if="clip.in_player_briefing" class="badge-muted">P</span>
                <span v-if="clip.status === 'error'" class="badge-loss">לא נשמר</span>
                <span v-if="clip.section" class="min-w-0 truncate text-sm">{{ clip.section }}</span>
                <span v-if="tagged(clip).length" class="text-sm text-muted" dir="ltr">{{ tagged(clip).map((p) => `#${p.jersey_number}`).join(' ') }}</span>
              </button>
            </li>
          </ol>
        </section>
      </div>
    </div>

    <div v-if="lastDeleted" role="status" class="card fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center justify-between gap-3 lg:bottom-6">
      <span>הקטע נמחק</span>
      <button type="button" class="btn-ghost" @click="undo">ביטול</button>
    </div>
  </div>
</template>
