<script setup>
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import VideoCard from './VideoCard.vue'

// Read-only list of {title, text, urls} items (a game's briefing or highlights).
const props = defineProps({ items: { type: Array, required: true } })

// A cross-origin iframe never reports a play, but clicking or tabbing into one blurs the window and makes it
// the active element: that is the video to enlarge. Keys are "item-video", so they reset with the list.
const root = useTemplateRef('root')
const activeVideo = ref(null)
watch(() => props.items, () => (activeVideo.value = null))
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
    <li v-for="(item, i) in items" :key="i" class="space-y-2">
      <VideoCard v-if="item.urls.length === 1" :video="{ url: item.urls[0], title: item.title }" :level="3" />
      <template v-else>
        <h3 class="font-bold">{{ item.title }}</h3>
        <ul v-if="item.urls.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="(url, j) in item.urls"
            :key="j"
            :data-video-key="`${i}-${j}`"
            :class="activeVideo === `${i}-${j}` && 'sm:order-first sm:col-span-full'"
          >
            <VideoCard :video="{ url, title: `${item.title} ${j + 1}` }" :show-title="false" />
          </li>
        </ul>
      </template>
      <p v-if="item.text" class="max-w-prose whitespace-pre-line">{{ item.text }}</p>
    </li>
  </ol>
</template>
