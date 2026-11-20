<script setup>
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import { clipUrl, groupBySection } from '../lib/clips'
import VideoCard from './VideoCard.vue'

// Read-only clips of a game (highlights, briefing) or a player's briefing, grouped by section.
const props = defineProps({ clips: { type: Array, required: true } })

const groups = computed(() => groupBySection(props.clips))
const isVideo = (clip) => !!clip.source_url

// A cross-origin iframe never reports a play, but clicking or tabbing into one blurs the window and makes it
// the active element: that is the video to enlarge. Keys are "group-clip", so they reset with the list.
const root = useTemplateRef('root')
const activeVideo = ref(null)
watch(() => props.clips, () => (activeVideo.value = null))
function syncActiveVideo() {
  const focused = document.activeElement
  if (!root.value?.contains(focused)) return // the page can hold two lists: only react to our own iframes
  const key = focused.closest?.('[data-video-key]')?.dataset.videoKey
  if (key) activeVideo.value = key
}
// Moving focus from one iframe to another fires no second window blur, so keep polling while the window is blurred.
let blurPoll = null
function onWindowBlur() {
  syncActiveVideo()
  blurPoll ??= setInterval(syncActiveVideo, 300)
}
function stopBlurPoll() {
  clearInterval(blurPoll)
  blurPoll = null
}
onMounted(() => {
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', stopBlurPoll)
})
onUnmounted(() => {
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', stopBlurPoll)
  stopBlurPoll()
})
</script>

<template>
  <ol ref="root" class="space-y-6">
    <li v-for="(group, i) in groups" :key="i" class="space-y-2">
      <!-- one video: its card carries the section as its title -->
      <template v-if="group.clips.length === 1 && isVideo(group.clips[0])">
        <VideoCard :video="{ url: clipUrl(group.clips[0]), title: group.section ?? 'קטע' }" :level="3" />
        <p v-if="group.clips[0].note" class="max-w-prose whitespace-pre-line">{{ group.clips[0].note }}</p>
      </template>
      <template v-else>
        <h3 v-if="group.section" class="font-bold">{{ group.section }}</h3>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <template v-for="(clip, j) in group.clips" :key="clip.id">
            <li
              v-if="isVideo(clip)"
              :data-video-key="`${i}-${j}`"
              class="space-y-2"
              :class="activeVideo === `${i}-${j}` && 'sm:order-first sm:col-span-full'"
            >
              <VideoCard :video="{ url: clipUrl(clip), title: `${group.section ?? 'קטע'} ${j + 1}` }" :show-title="false" />
              <p v-if="clip.note" class="max-w-prose whitespace-pre-line">{{ clip.note }}</p>
            </li>
            <li v-else class="sm:col-span-full">
              <p class="max-w-prose whitespace-pre-line">{{ clip.note }}</p>
            </li>
          </template>
        </ul>
      </template>
    </li>
  </ol>
</template>
