<script setup>
import { ref, watch } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import VideoCard from '../components/VideoCard.vue'
import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const videos = ref([])
const posts = ref([])
const images = ref([])

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
  const [v, p, i] = await Promise.all([
    apiFetch(`/teams/${id}/videos`),
    apiFetch(`/teams/${id}/posts`),
    apiFetch(`/teams/${id}/images`),
  ])
  videos.value = newestFirst(v)
  posts.value = newestFirst(p)
  images.value = newestFirst(i)
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

    <TabsRoot default-value="videos" class="space-y-6">
      <TabsList class="flex gap-4 border-b border-neutral-200 dark:border-neutral-800">
        <TabsTrigger
          v-for="tab in tabs"
          :key="tab.value"
          :value="tab.value"
          class="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm hover:underline data-[state=active]:border-current data-[state=active]:font-semibold"
        >
          {{ tab.label }}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="videos">
        <ul v-if="videos.length" class="grid gap-6 lg:grid-cols-2">
          <li v-for="video in videos" :key="video.id"><VideoCard :video="video" /></li>
        </ul>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="posts">
        <div v-if="posts.length" class="space-y-6">
          <article v-for="post in posts" :key="post.id" class="space-y-1">
            <h3 class="font-semibold">{{ post.title }}</h3>
            <p class="text-neutral-600 dark:text-neutral-400">{{ post.body }}</p>
          </article>
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>

      <TabsContent value="images">
        <div v-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <figure v-for="image in images" :key="image.id" class="space-y-1">
            <img :src="image.url" :alt="image.title" class="aspect-square w-full rounded object-cover" />
            <figcaption class="text-sm">{{ image.title }}</figcaption>
          </figure>
        </div>
        <p v-else class="empty-state">אין פריטים עדיין.</p>
      </TabsContent>
    </TabsRoot>
  </section>
</template>
