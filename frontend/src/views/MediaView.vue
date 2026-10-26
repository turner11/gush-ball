<script setup>
import { computed, ref, watch } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import ImageGallery from '../components/ImageGallery.vue'
import LoadError from '../components/LoadError.vue'
import PostCard from '../components/PostCard.vue'
import TeamContentSection from '../components/TeamContentSection.vue'
import VideoCard from '../components/VideoCard.vue'
import { canEditTeam } from '../composables/useAuth'
import { useInlineEditor } from '../composables/useInlineEditor'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { CONTENT_SECTIONS } from '../lib/teamContent'

const videos = ref([])
const posts = ref([])
const images = ref([])
const loading = ref(false)
const loadError = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

// ponytail: the API has no ORDER BY, so highest id = newest.
const newestFirst = (items) => [...items].sort((a, b) => b.id - a.id)

async function load() {
  loadError.value = false
  if (!selectedTeamId.value) {
    videos.value = posts.value = images.value = []
    return
  }
  const id = selectedTeamId.value
  loading.value = true
  try {
    const [v, p, i] = await Promise.all([
      apiFetch(`/teams/${id}/videos`),
      apiFetch(`/teams/${id}/posts`),
      apiFetch(`/teams/${id}/images`),
    ])
    if (id !== selectedTeamId.value) return // a newer team was selected meanwhile
    videos.value = newestFirst(v)
    posts.value = p
    images.value = newestFirst(i)
  } catch {
    if (id === selectedTeamId.value) loadError.value = true
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, load, { immediate: true })

const canEdit = computed(() => !!selectedTeamId.value && canEditTeam(selectedTeamId.value))
const { editing, toggleEl: editToggle, toggle: toggleEditing } = useInlineEditor(canEdit, load) // closing shows what the editors changed

const tabs = [
  { value: 'videos', label: 'סרטונים' },
  { value: 'posts', label: 'עדכונים' },
  { value: 'images', label: 'תמונות' },
]
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">מדיה</h1>
      <button v-if="canEdit" ref="editToggle" type="button" class="btn-secondary" :aria-expanded="editing" @click="toggleEditing">
        {{ editing ? 'סיום עריכה' : 'עריכת מדיה' }}
      </button>
    </div>

    <LoadError v-if="loadError" message="שגיאה בטעינת המדיה" @retry="load" />

    <TabsRoot v-else default-value="videos" dir="rtl" class="space-y-6">
      <TabsList class="segmented">
        <TabsTrigger
          v-for="tab in tabs"
          :key="tab.value"
          :value="tab.value"
          class="segmented-item"
        >
          {{ tab.label }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="videos">
        <TeamContentSection v-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.videos" />
        <div v-else-if="loading" class="space-y-3" aria-busy="true">
          <div class="skeleton h-32" />
          <div class="skeleton h-32" />
        </div>
        <ul v-else-if="videos.length" class="grid gap-6 sm:grid-cols-2">
          <li v-for="video in videos" :key="video.id"><VideoCard :video="video" /></li>
        </ul>
        <p v-else class="empty-state">אין סרטונים עדיין.</p>
      </TabsContent>

      <TabsContent value="posts">
        <TeamContentSection v-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.posts" />
        <div v-else-if="loading" class="skeleton h-32" aria-busy="true" />
        <div v-else-if="posts.length" class="space-y-6">
          <PostCard v-for="post in posts" :key="post.id" :post="post" />
        </div>
        <p v-else class="empty-state">אין עדכונים עדיין.</p>
      </TabsContent>

      <TabsContent value="images">
        <TeamContentSection v-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.images" />
        <div v-else-if="loading" class="skeleton h-32" aria-busy="true" />
        <ImageGallery v-else-if="images.length" :images="images" fallback-alt="תמונה של הקבוצה" />
        <p v-else class="empty-state">אין תמונות עדיין.</p>
      </TabsContent>
    </TabsRoot>
  </section>
</template>
