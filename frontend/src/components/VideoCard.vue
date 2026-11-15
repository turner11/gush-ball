<script setup>
import { computed } from 'vue'
import { formatTimestamp, videoSegment, youtubeEmbedUrl, youtubeWatchUrl } from '../lib/youtube'
import AppIcon from './AppIcon.vue'

// level: the heading level, so a card nests under whatever heading its page has
const props = defineProps({ video: { type: Object, required: true }, level: { type: Number, default: 3 } })

const segment = computed(() => videoSegment(props.video.url))
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
    <div v-if="youtubeEmbedUrl(video.url)" class="flex items-start justify-between gap-2">
      <component :is="'h' + level" class="min-w-0 break-words font-bold">{{ video.title }}</component>
      <a
        :href="youtubeWatchUrl(video.url)"
        target="_blank"
        rel="noopener"
        class="section-link shrink-0 text-sm"
        :aria-label="`צפייה ביוטיוב: ${video.title} (נפתח בלשונית חדשה)`"
      >יוטיוב<AppIcon name="external" /></a>
    </div>
    <p v-if="youtubeEmbedUrl(video.url) && (segment.start !== null || segment.end !== null)" class="text-sm text-muted">
      <template v-if="segment.start !== null && segment.end !== null">קטע: <span dir="ltr">{{ formatTimestamp(segment.start) }}–{{ formatTimestamp(segment.end) }}</span></template>
      <template v-else-if="segment.start !== null">מ-<span dir="ltr">{{ formatTimestamp(segment.start) }}</span></template>
      <template v-else>עד <span dir="ltr">{{ formatTimestamp(segment.end) }}</span></template>
    </p>
  </article>
</template>
