<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import ImageLightbox from '../components/ImageLightbox.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import VideoCard from '../components/VideoCard.vue'
import { canEditTeam, teamMember, useAuth, viewer } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { CONTENT_SECTIONS } from '../lib/teamContent'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const { selectedTeamId } = useSelectedTeam()
const { checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const plays = ref([])
const lightbox = ref(null)
const loading = ref(false)
const error = ref(false)

// Image plays open in the in-page viewer; its index is into this filtered list.
const imagePlays = computed(() => plays.value.filter((p) => playKind(p) === 'image'))
const lightboxImages = computed(() => imagePlays.value.map((p) => ({ url: p.file_url, alt: p.title })))

// Hosts whose pages we frame (keep in sync with frame-src in frontend/Caddyfile).
const EMBED_HOSTS = ['app.thehoopsgeek.com']

function isEmbed(url) {
  try {
    return EMBED_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

// Uploaded keys always end in an allow-listed extension (storage.py), so it tells the kinds apart.
function playKind(play) {
  if (play.url) return isEmbed(play.url) ? 'embed' : 'link'
  if (play.file_url.endsWith('.mp4')) return 'video'
  return play.file_url.endsWith('.pdf') ? 'pdf' : 'image'
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
        <VideoCard v-if="playKind(play) === 'link'" :video="play" />
        <template v-else>
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
            class="aspect-video w-full rounded-2xl border-0 bg-raised"
          />
          <video v-else-if="playKind(play) === 'video'" :src="play.file_url" :aria-label="play.title" controls preload="metadata" playsinline class="w-full rounded-xl" />
          <a v-else :href="play.file_url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">
            <span class="font-extrabold">{{ play.title }}</span><span class="badge badge-muted">PDF</span><AppIcon name="external" />
          </a>
          <h2 v-if="['image', 'video', 'embed'].includes(playKind(play))" class="font-extrabold">{{ play.title }}</h2>
        </template>
        <p v-if="play.notes" class="whitespace-pre-line text-muted">{{ play.notes }}</p>
      </li>
    </ul>
    <ImageLightbox ref="lightbox" :images="lightboxImages" />
  </section>
</template>
