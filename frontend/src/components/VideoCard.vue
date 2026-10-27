<script setup>
import { youtubeEmbedUrl } from '../lib/youtube'
import AppIcon from './AppIcon.vue'

// level: the heading level, so a card nests under whatever heading its page has
defineProps({ video: { type: Object, required: true }, level: { type: Number, default: 3 } })
</script>

<template>
  <article class="space-y-2">
    <iframe
      v-if="youtubeEmbedUrl(video.url)"
      :src="youtubeEmbedUrl(video.url)"
      :title="video.title"
      loading="lazy"
      allowfullscreen
      class="aspect-video w-full rounded-2xl border-0 bg-black"
    ></iframe>
    <a v-else :href="video.url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">{{ video.title }}<AppIcon name="external" /></a>
    <component :is="'h' + level" v-if="youtubeEmbedUrl(video.url)" class="font-bold">{{ video.title }}</component>
  </article>
</template>
