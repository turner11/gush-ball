<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import VideoCard from '../components/VideoCard.vue'
import { teamMember, useAuth } from '../composables/useAuth'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const route = useRoute()
const { selectedTeamId } = useSelectedTeam()
const { user, checked, checkSession } = useAuth()
if (!checked.value) checkSession()

const plays = ref([])
const loading = ref(false)
const error = ref(false)

// Uploaded keys always end in an allow-listed extension (storage.py), so it tells the kinds apart.
function playKind(play) {
  if (play.url) return 'link'
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

watch([selectedTeamId, checked], load, { immediate: true })
</script>

<template>
  <section v-if="selectedTeamId" class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">פלייבוק</h1>
    </div>

    <div v-if="!checked || loading" class="grid gap-6 sm:grid-cols-2" aria-busy="true">
      <div class="skeleton h-44" />
      <div class="skeleton h-44" />
    </div>
    <div v-else-if="!teamMember(selectedTeamId)" class="space-y-3">
      <p class="empty-state">הדף זמין לחברי הקבוצה בלבד</p>
      <RouterLink v-if="!user" :to="{ name: 'admin-login', query: { next: route.fullPath } }" class="btn-primary w-full sm:w-auto">כניסה / הרשמה</RouterLink>
    </div>
    <div v-else-if="error" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת המהלכים</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <p v-else-if="!plays.length" class="empty-state">עדיין אין מהלכים</p>
    <ul v-else class="grid gap-6 sm:grid-cols-2">
      <li v-for="play in plays" :key="play.id" class="space-y-2">
        <VideoCard v-if="playKind(play) === 'link'" :video="play" />
        <template v-else>
          <a v-if="playKind(play) === 'image'" :href="play.file_url" target="_blank" rel="noopener">
            <img :src="play.file_url" :alt="play.title" loading="lazy" class="w-full rounded-xl object-contain" />
          </a>
          <video v-else-if="playKind(play) === 'video'" :src="play.file_url" :aria-label="play.title" controls preload="metadata" playsinline class="w-full rounded-xl" />
          <a v-else :href="play.file_url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">
            <span class="font-extrabold">{{ play.title }}</span><span class="badge badge-muted">PDF</span><AppIcon name="external" />
          </a>
          <h2 v-if="['image', 'video'].includes(playKind(play))" class="font-extrabold">{{ play.title }}</h2>
        </template>
        <p v-if="play.notes" class="whitespace-pre-line text-muted">{{ play.notes }}</p>
      </li>
    </ul>
  </section>
</template>
