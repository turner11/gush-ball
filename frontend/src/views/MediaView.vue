<script setup>
import { computed, ref, watch } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import ImageLightbox from '../components/ImageLightbox.vue'
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
const lightbox = ref(null)
const loading = ref(false)

// DefaultLayout picks the default team; this view only follows the selection.
const { selectedTeamId } = useSelectedTeam()

// ponytail: the API has no ORDER BY, so highest id = newest.
const newestFirst = (items) => [...items].sort((a, b) => b.id - a.id)

async function load() {
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
      <button v-if="canEdit" ref="editToggle" type="button" class="btn-secondary" :aria-pressed="editing" @click="toggleEditing">
        {{ editing ? 'סיום עריכה' : 'עריכת מדיה' }}
      </button>
    </div>

    <TabsRoot default-value="videos" dir="rtl" class="space-y-6">
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
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="posts">
        <TeamContentSection v-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.posts" />
        <div v-else-if="loading" class="skeleton h-32" aria-busy="true" />
        <div v-else-if="posts.length" class="space-y-6">
          <PostCard v-for="post in posts" :key="post.id" :post="post" />
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="images">
        <TeamContentSection v-if="editing" :key="selectedTeamId" :owner-id="selectedTeamId" v-bind="CONTENT_SECTIONS.images" />
        <div v-else-if="loading" class="skeleton h-32" aria-busy="true" />
        <div v-else-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <figure v-for="(image, i) in images" :key="image.id" class="space-y-1">
            <button type="button" class="block w-full cursor-zoom-in" :aria-label="`הגדלת תמונה: ${image.title}`" @click="lightbox.open(i, $event)">
              <img :src="image.url" :alt="image.title" loading="lazy" class="aspect-square w-full rounded-xl object-cover" />
            </button>
            <figcaption class="text-sm text-muted">{{ image.title }}</figcaption>
          </figure>
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
        <ImageLightbox ref="lightbox" :images="images.map((i) => ({ url: i.url, alt: i.title }))" />
      </TabsContent>
    </TabsRoot>
  </section>
</template>
