<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

import { loadYouTubeApi, stepRate, youtubeId } from '../lib/youtube'

// The studio's video: a YouTube IFrame API player the page can read the time of and seek. `url` is the video
// it starts with; the page switches video with `load`.
// disablekb: the page owns the keyboard (Space, arrows...), the player must not also react.
const props = defineProps({ url: { type: String, required: true } })
const emit = defineEmits(['error', 'ratechange'])

const host = useTemplateRef('host')
let player = null

onMounted(async () => {
  try {
    const YT = await loadYouTubeApi()
    const mount = document.createElement('div') // YT.Player replaces its element: keep Vue's own node
    host.value.append(mount)
    player = new YT.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      videoId: youtubeId(props.url),
      playerVars: { rel: 0, playsinline: 1, disablekb: 1 },
      events: { onError: () => emit('error'), onPlaybackRateChange: (e) => emit('ratechange', e.data) },
    })
  } catch {
    emit('error')
  }
})
onBeforeUnmount(() => player?.destroy?.())

function load(url, start = 0) {
  const videoId = youtubeId(url)
  if (videoId && player) player.loadVideoById({ videoId, startSeconds: start })
}

defineExpose({
  currentTime: () => player?.getCurrentTime?.() ?? 0,
  seek: (seconds) => player?.seekTo?.(seconds, true),
  toggle: () => (player?.getPlayerState?.() === 1 ? player.pauseVideo() : player?.playVideo?.()),
  // the page learns the new rate from `ratechange`: YouTube may adjust it, and its own menu changes it too
  stepRate: (step) => player?.setPlaybackRate?.(stepRate(player.getAvailablePlaybackRates?.() ?? [1], player.getPlaybackRate?.() ?? 1, step)),
  load,
})
</script>

<template>
  <div ref="host" class="aspect-video w-full overflow-hidden rounded-2xl bg-black [&_iframe]:size-full"></div>
</template>
