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
      :src="player?.images?.[0]?.url || '/default-player.png'"
      :alt="player?.name ?? ''"
      class="mx-auto h-20 w-20 rounded-full object-cover object-top"
    />
    <p class="font-semibold">#{{ player?.jersey_number ?? jersey }}</p>
    <p v-if="player" class="text-sm">{{ player.name }}</p>
  </div>
</template>
