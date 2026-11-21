<script>
// The embedded player now playing, shared by every card on the page so starting one pauses the other.
let playingPlayer = null
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { formatTimestamp, loadYouTubeApi, videoSegment, youtubeEmbedUrl, youtubeId, youtubeWatchUrl } from '../lib/youtube'
import AppIcon from './AppIcon.vue'

// level: the heading level, so a card nests under whatever heading its page has
// showTitle: false when a parent heading already names the card (iframe title and link label stay)
const props = defineProps({ video: { type: Object, required: true }, level: { type: Number, default: 3 }, showTitle: { type: Boolean, default: true } })

const segment = computed(() => videoSegment(props.video.url))
const frame = useTemplateRef('frame')
let player = null

// Player states: 0 = ended, 1 = playing.
function onStateChange({ data, target }) {
  if (data === 1) {
    if (playingPlayer && playingPlayer !== target) playingPlayer.pauseVideo?.()
    playingPlayer = target
  } else if (data === 0 && (segment.value.start !== null || segment.value.end !== null)) {
    // YouTube's replay would restart the whole video; re-cue so the next play is the same clip.
    const cue = { videoId: youtubeId(props.video.url), startSeconds: segment.value.start ?? 0 }
    if (segment.value.end !== null) cue.endSeconds = segment.value.end
    target.cueVideoById(cue)
  }
}

// Progressive enhancement: if the API fails to load, the plain iframe still plays.
onMounted(async () => {
  if (!frame.value) return
  try {
    await loadYouTubeApi()
  } catch {
    return
  }
  if (!frame.value) return
  player = new window.YT.Player(frame.value, { events: { onStateChange } })
})

onBeforeUnmount(() => {
  if (playingPlayer === player) playingPlayer = null
  player?.destroy?.()
})
</script>

<template>
  <article class="space-y-2">
    <iframe
      ref="frame"
      v-if="youtubeEmbedUrl(video.url)"
      :src="youtubeEmbedUrl(video.url)"
      :title="video.title"
      loading="lazy"
      allowfullscreen
      class="aspect-video w-full rounded-2xl border-0 bg-black"
    ></iframe>
    <a v-else :href="video.url" target="_blank" rel="noopener" class="card flex items-center justify-between gap-2 hover:underline">{{ video.title }}<AppIcon name="external" /></a>
    <div v-if="youtubeEmbedUrl(video.url)" class="flex items-baseline justify-between gap-2">
      <component :is="'h' + level" v-if="showTitle" class="min-w-0 break-words font-bold">{{ video.title }}</component>
      <a
        :href="youtubeWatchUrl(video.url)"
        target="_blank"
        rel="noopener"
        class="section-link shrink-0"
        :aria-label="`צפייה ביוטיוב: ${video.title} (נפתח בלשונית חדשה)`"
      >יוטיוב<AppIcon name="external" /></a>
    </div>
    <p v-if="youtubeEmbedUrl(video.url) && (segment.start !== null || segment.end !== null)" class="text-sm text-muted">
      <template v-if="segment.start !== null && segment.end !== null">קטע: <span dir="ltr">{{ formatTimestamp(segment.start) }}–{{ formatTimestamp(segment.end) }}</span></template>
      <template v-else-if="segment.start !== null">מ-<span dir="ltr">{{ formatTimestamp(segment.start) }}</span></template>
      <template v-else>עד <span dir="ltr">{{ formatTimestamp(segment.end) }}</span></template>
    </p>
    <p v-if="video.text" class="line-clamp-3 max-w-prose whitespace-pre-line text-sm text-muted">{{ video.text }}</p>
  </article>
</template>
