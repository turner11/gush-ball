<script setup>
defineProps({ video: { type: Object, required: true } })

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
  <article class="grid items-start gap-3 sm:grid-cols-[3fr_2fr]">
    <iframe
      v-if="youtubeId(video.url)"
      :src="`https://www.youtube-nocookie.com/embed/${youtubeId(video.url)}`"
      :title="video.title"
      loading="lazy"
      allowfullscreen
      class="aspect-video w-full border-0"
    ></iframe>
    <a v-else :href="video.url" target="_blank" rel="noopener" class="hover:underline">{{ video.title }}</a>
    <h3 v-if="youtubeId(video.url)" class="font-semibold">{{ video.title }}</h3>
  </article>
</template>
