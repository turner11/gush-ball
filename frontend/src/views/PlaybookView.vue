<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ImageLightbox from '../components/ImageLightbox.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import { canEditTeam, teamMember, useAuth, viewer } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { CONTENT_SECTIONS } from '../lib/teamContent'
import { youtubeEmbedUrl } from '../lib/youtube'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const { selectedTeamId } = useSelectedTeam()
const { checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const plays = ref([])
const lightbox = ref(null)
const playDialog = ref(null)
const openPlay = ref(null) // the embed/YouTube/video play shown in the full-screen dialog
const startAt = ref(0) // seconds the inline video had reached, so the dialog copy continues from there
let playOpener = null // the button that opened it, refocused on close
const loading = ref(false)
const error = ref(false)

// Image plays open in the in-page viewer; its index is into this filtered list.
const imagePlays = computed(() => plays.value.filter((p) => playKind(p) === 'image'))
const lightboxImages = computed(() => imagePlays.value.map((p) => ({ url: p.file_url, alt: p.title })))

// Hosts whose pages we frame (keep in sync with frame-src in frontend/Caddyfile).
const EMBED_HOSTS = ['www.thehoopsgeek.com']

function isEmbed(url) {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && EMBED_HOSTS.includes(hostname)
  } catch {
    return false
  }
}

// Uploaded keys always end in an allow-listed extension (storage.py), so it tells the kinds apart.
function playKind(play) {
  if (play.url) return isEmbed(play.url) ? 'embed' : youtubeEmbedUrl(play.url) ? 'youtube' : 'link'
  if (play.file_url.endsWith('.mp4')) return 'video'
  return play.file_url.endsWith('.pdf') ? 'pdf' : 'image'
}

function frameSrc(play) {
  return playKind(play) === 'embed' ? play.url : youtubeEmbedUrl(play.url)
}

function openPlayDialog(play, event) {
  playOpener = event.currentTarget
  const inline = playOpener.closest('li')?.querySelector('video') // pause it so two audio tracks never overlap
  startAt.value = inline?.currentTime ?? 0
  inline?.pause()
  openPlay.value = play
  playDialog.value.showModal()
}

// Fires for Esc, the close button and dialog.close() alike. Explicit focus: Safari never focuses a clicked button.
function onPlayClose() {
  openPlay.value = null
  playOpener?.focus()
}

async function load() {
  const id = selectedTeamId.value
  if (!id || !checked.value || !teamMember(id)) return
  loading.value = true
  error.value = false
  try {
    const loaded = await apiFetch(`/teams/${id}/plays`)
    if (id === selectedTeamId.value) plays.value = loaded // else a newer team was selected meanwhile
  } catch {
    if (id === selectedTeamId.value) error.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch([selectedTeamId, checked, viewer], load, { immediate: true })

const canEdit = computed(() => !!selectedTeamId.value && canEditTeam(selectedTeamId.value))
const { editing, toggleEl: editToggle, toggle: toggleEditing } = useInlineEditor(canEdit, load) // closing shows what the editor changed
</script>

<template>
  <section v-if="selectedTeamId" class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">פלייבוק</h1>
      <button v-if="canEdit" ref="editToggle" type="button" class="btn-secondary" :aria-expanded="editing" @click="toggleEditing">
        {{ editing ? 'סיום עריכה' : 'עריכת מהלכים' }}
      </button>
    </div>

    <TeamContentSection v-if="editing && canEdit" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.plays" />
    <div v-else-if="!checked || loading" class="grid gap-6 sm:grid-cols-2" aria-busy="true">
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <div v-else-if="!teamMember(selectedTeamId)" class="space-y-3">
      <p class="empty-state">הדף זמין לחברי הקבוצה בלבד</p>
      <RouterLink v-if="!viewer" :to="{ name: 'admin-login', query: { next: route.fullPath } }" class="btn-primary w-full sm:w-auto">כניסה / הרשמה</RouterLink>
    </div>
    <LoadError v-else-if="error" message="שגיאה בטעינת המהלכים" @retry="load" />
    <p v-else-if="!plays.length" class="empty-state">עדיין אין מהלכים</p>
    <ul v-else class="grid gap-6 sm:grid-cols-2">
      <li v-for="play in plays" :key="play.id" class="space-y-2">
        <button
          v-if="playKind(play) === 'image'"
          type="button"
          class="block w-full cursor-zoom-in"
          :aria-label="`הגדלת תמונה: ${play.title}`"
          @click="lightbox.open(imagePlays.indexOf(play), $event)"
        >
          <img :src="play.file_url" :alt="play.title" loading="lazy" class="w-full rounded-xl object-contain" />
        </button>
        <iframe
          v-else-if="playKind(play) === 'embed'"
          :src="play.url"
          :title="play.title"
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          allowfullscreen
          class="aspect-[8/5] w-full rounded-2xl border-0 bg-raised"
        />
        <iframe
          v-else-if="playKind(play) === 'youtube'"
          :src="youtubeEmbedUrl(play.url)"
          :title="play.title"
          loading="lazy"
          allowfullscreen
          class="aspect-video w-full rounded-2xl border-0 bg-black"
        />
        <video v-else-if="playKind(play) === 'video'" :src="play.file_url" :aria-label="play.title" controls preload="metadata" playsinline class="w-full rounded-xl" />
        <a v-else :href="play.url || play.file_url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">
          <span class="font-extrabold">{{ play.title }}</span><span v-if="playKind(play) === 'pdf'" class="badge badge-muted">PDF</span><AppIcon name="external" />
        </a>
        <div class="flex items-center justify-between gap-2">
          <h2 v-if="!['pdf', 'link'].includes(playKind(play))" class="truncate font-extrabold">{{ play.title }}</h2>
          <!-- A PDF or third-party page can't be framed (CSP), so its full screen is a new tab. -->
          <a
            v-if="['pdf', 'link'].includes(playKind(play))"
            :href="play.url || play.file_url"
            target="_blank"
            rel="noopener"
            class="btn-ghost ms-auto shrink-0"
            :aria-label="`מסך מלא: ${play.title} (נפתח בלשונית חדשה)`"
          >
            <AppIcon name="external" />מסך מלא
          </a>
          <button
            v-else
            type="button"
            class="btn-ghost ms-auto shrink-0"
            aria-haspopup="dialog"
            :aria-label="`מסך מלא: ${play.title}`"
            @click="playKind(play) === 'image' ? lightbox.open(imagePlays.indexOf(play), $event) : openPlayDialog(play, $event)"
          >
            <AppIcon name="expand" />מסך מלא
          </button>
        </div>
        <p v-if="play.notes" class="whitespace-pre-line text-muted">{{ play.notes }}</p>
      </li>
    </ul>
    <ImageLightbox ref="lightbox" :images="lightboxImages" />
    <dialog
      ref="playDialog"
      aria-labelledby="play-dialog-title"
      class="fixed inset-0 m-0 size-full max-h-none max-w-none flex-col border-0 bg-transparent p-0 text-white backdrop:bg-black/90 open:flex"
      @close="onPlayClose"
    >
      <div class="flex items-center justify-between gap-2 p-2 sm:px-6">
        <h2 id="play-dialog-title" class="truncate font-extrabold">{{ openPlay?.title }}</h2>
        <button type="button" class="btn-icon bg-black/50" aria-label="סגירה" @click="playDialog.close()"><AppIcon name="close" /></button>
      </div>
      <div class="min-h-0 flex-1 px-2 pb-2 sm:px-6 sm:pb-6">
        <video
          v-if="openPlay && playKind(openPlay) === 'video'"
          :src="`${openPlay.file_url}#t=${startAt}`"
          :aria-label="openPlay.title"
          controls
          autoplay
          playsinline
          class="size-full rounded-2xl bg-black object-contain"
        />
        <iframe
          v-else-if="openPlay"
          :src="frameSrc(openPlay)"
          :title="openPlay.title"
          :sandbox="playKind(openPlay) === 'embed' ? 'allow-scripts allow-same-origin' : null"
          allowfullscreen
          class="size-full rounded-2xl border-0 bg-raised"
        />
      </div>
    </dialog>
  </section>
</template>
