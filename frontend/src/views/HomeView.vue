<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const teams = ref([])
const team = ref(null)
const links = ref([])
const videos = ref([])
const images = ref([])
const posts = ref([])

const { selectedTeamId, ensureDefault } = useSelectedTeam()

async function load() {
  if (!selectedTeamId.value) {
    team.value = null
    links.value = []
    videos.value = []
    images.value = []
    posts.value = []
    return
  }

  const id = selectedTeamId.value
  ;[team.value, links.value, videos.value, images.value, posts.value] = await Promise.all([
    apiFetch(`/teams/${id}`),
    apiFetch(`/teams/${id}/links`),
    apiFetch(`/teams/${id}/videos`),
    apiFetch(`/teams/${id}/images`),
    apiFetch(`/teams/${id}/posts`),
  ])
}

onMounted(async () => {
  teams.value = await apiFetch('/teams')
  ensureDefault(teams.value)
  await load()
})

watch(selectedTeamId, load)

const facebookEmbedSrc = computed(
  () =>
    'https://www.facebook.com/plugins/page.php?href=' +
    encodeURIComponent(team.value.facebook_url) +
    '&tabs=timeline&width=500&height=600&small_header=true',
)
</script>

<template>
  <section v-if="team" class="space-y-8">
    <div class="flex items-center gap-4">
      <img v-if="team.logo_url" :src="team.logo_url" :alt="team.name" class="h-16 w-16 rounded object-contain" />
      <div>
        <h1 class="page-title">{{ team.name }}</h1>
        <p v-if="team.home_court_address" class="text-neutral-600 dark:text-neutral-400">
          {{ team.home_court_address }}
        </p>
      </div>
    </div>

    <div v-if="team.facebook_url || team.instagram_url || team.youtube_url || team.tiktok_url" class="flex gap-3 text-sm">
      <a v-if="team.facebook_url" :href="team.facebook_url" target="_blank" rel="noopener" class="hover:underline">פייסבוק</a>
      <a v-if="team.instagram_url" :href="team.instagram_url" target="_blank" rel="noopener" class="hover:underline">אינסטגרם</a>
      <a v-if="team.youtube_url" :href="team.youtube_url" target="_blank" rel="noopener" class="hover:underline">יוטיוב</a>
      <a v-if="team.tiktok_url" :href="team.tiktok_url" target="_blank" rel="noopener" class="hover:underline">טיקטוק</a>
    </div>

    <!-- ponytail: IG has no official profile-feed embed; add per-post embeds if the club wants them -->
    <section v-if="team.facebook_url" class="space-y-2">
      <h2 class="section-title">פייסבוק</h2>
      <iframe
        :src="facebookEmbedSrc"
        title="עמוד הפייסבוק של הקבוצה"
        loading="lazy"
        class="h-[600px] w-full max-w-[500px] border-0"
      ></iframe>
    </section>

    <section class="space-y-2">
      <h2 class="section-title">קישורים</h2>
      <ul v-if="links.length" class="space-y-1">
        <li v-for="link in links" :key="link.id">
          <a :href="link.url" target="_blank" rel="noopener" class="hover:underline">{{ link.label }}</a>
        </li>
      </ul>
      <p v-else class="empty-state">אין קישורים עדיין.</p>
    </section>

    <section class="space-y-2">
      <h2 class="section-title">סרטונים</h2>
      <ul v-if="videos.length" class="space-y-1">
        <li v-for="video in videos" :key="video.id">
          <a :href="video.url" target="_blank" rel="noopener" class="hover:underline">{{ video.title }}</a>
        </li>
      </ul>
      <p v-else class="empty-state">אין סרטונים עדיין.</p>
    </section>

    <section class="space-y-2">
      <h2 class="section-title">תמונות</h2>
      <div v-if="images.length" class="flex flex-wrap gap-3">
        <img v-for="image in images" :key="image.id" :src="image.url" :alt="image.title" class="h-24 w-24 rounded object-cover" />
      </div>
      <p v-else class="empty-state">אין תמונות עדיין.</p>
    </section>

    <section class="space-y-3">
      <h2 class="section-title">עדכונים</h2>
      <article v-for="post in posts" :key="post.id" class="space-y-1 border-b border-neutral-200 pb-3 dark:border-neutral-700">
        <h3 class="font-semibold">{{ post.title }}</h3>
        <p class="text-neutral-600 dark:text-neutral-400">{{ post.body }}</p>
      </article>
      <p v-if="!posts.length" class="empty-state">אין עדכונים עדיין.</p>
    </section>
  </section>

  <section v-else class="space-y-2">
    <h1 class="page-title">ברוכים הבאים</h1>
    <p class="text-neutral-600 dark:text-neutral-400">אין קבוצות במערכת עדיין.</p>
  </section>
</template>
