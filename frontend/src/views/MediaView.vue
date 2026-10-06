<script setup>
import { ref, watch } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import VideoCard from '../components/VideoCard.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const videos = ref([])
const posts = ref([])
const images = ref([])
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
    posts.value = newestFirst(p)
    images.value = newestFirst(i)
  } finally {
    if (id === selectedTeamId.value) loading.value = false
  }
}

watch(selectedTeamId, load, { immediate: true })

const tabs = [
  { value: 'videos', label: 'סרטונים' },
  { value: 'posts', label: 'עדכונים' },
  { value: 'images', label: 'תמונות' },
]
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">מדיה</h1>

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
        <div v-if="loading" class="space-y-3" aria-busy="true">
          <div class="skeleton h-32" />
          <div class="skeleton h-32" />
        </div>
        <ul v-else-if="videos.length" class="grid gap-6 sm:grid-cols-2">
          <li v-for="video in videos" :key="video.id"><VideoCard :video="video" /></li>
        </ul>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="posts">
        <div v-if="loading" class="skeleton h-32" aria-busy="true" />
        <div v-else-if="posts.length" class="space-y-6">
          <article v-for="post in posts" :key="post.id" class="card space-y-2">
            <h3 class="text-lg font-extrabold">{{ post.title }}</h3>
            <p class="max-w-prose whitespace-pre-line text-muted">{{ post.body }}</p>
          </article>
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="images">
        <div v-if="loading" class="skeleton h-32" aria-busy="true" />
        <div v-else-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <a v-for="image in images" :key="image.id" :href="image.url" target="_blank" rel="noopener">
            <figure class="space-y-1">
              <img :src="image.url" :alt="image.title" loading="lazy" class="aspect-square w-full rounded-xl object-cover" />
              <figcaption class="text-sm text-muted">{{ image.title }}</figcaption>
            </figure>
          </a>
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>
    </TabsRoot>
  </section>
</template>
