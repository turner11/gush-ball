<script setup>
import AppIcon from './AppIcon.vue'

// level: the heading level, so a card nests under whatever heading its page has
defineProps({ video: { type: Object, required: true }, level: { type: Number, default: 3 } })

function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)
      return m ? m[1] : null
    }
  } catch {
    // fall through to a plain link
  }
  return null
}
</script>

<template>
  <article class="space-y-2">
    <iframe
      v-if="youtubeId(video.url)"
      :src="`https://www.youtube-nocookie.com/embed/${youtubeId(video.url)}`"
      :title="video.title"
      loading="lazy"
      allowfullscreen
      class="aspect-video w-full rounded-2xl border-0 bg-black"
    ></iframe>
    <a v-else :href="video.url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">{{ video.title }}<AppIcon name="external" /></a>
    <component :is="'h' + level" v-if="youtubeId(video.url)" class="font-bold">{{ video.title }}</component>
  </article>
</template>
