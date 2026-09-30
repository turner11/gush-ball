<script setup>
// `player` may be undefined (jersey not on the roster); `jersey` is then shown as #N.
defineProps({
  player: { type: Object, default: null },
  jersey: { type: Number, default: null },
})

const DEFAULT = '/default-player.png'
// Dead/blocked hotlink -> default; the endsWith guard stops a loop if the default itself fails.
function onImgError(e) {
  if (!e.target.src.endsWith(DEFAULT)) e.target.src = DEFAULT
}
</script>

<template>
  <div class="space-y-1 text-center">
    <img
      :src="player?.images?.[0]?.url || '/default-player.png'"
      :alt="player?.name ?? ''"
      loading="lazy"
      class="mx-auto size-16 rounded-full object-cover object-top ring-2 ring-neutral-200 sm:size-20 dark:ring-neutral-700"
      @error="onImgError"
    />
    <p class="font-extrabold text-team">#{{ player?.jersey_number ?? jersey }}</p>
    <p v-if="player" class="text-sm font-medium leading-tight">{{ player.name }}</p>
  </div>
</template>
