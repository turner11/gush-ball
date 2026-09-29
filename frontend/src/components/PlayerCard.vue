<script setup>
// `player` may be undefined (jersey not on the roster); `jersey` is then shown as #N.
defineProps({
  player: { type: Object, default: null },
  jersey: { type: Number, default: null },
})
</script>

<template>
  <div class="space-y-1 text-center">
    <img
      v-if="player?.images?.[0]?.url"
      :src="player.images[0].url"
      :alt="player.name"
      class="mx-auto h-20 w-20 rounded-full object-cover"
    />
    <div
      v-else
      class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-200 text-xl font-bold dark:bg-neutral-700"
    >
      {{ player?.jersey_number ?? jersey }}
    </div>
    <p class="font-semibold">#{{ player?.jersey_number ?? jersey }}</p>
    <p v-if="player" class="text-sm">{{ player.name }}</p>
  </div>
</template>
