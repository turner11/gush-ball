<script setup>
// `player` may be undefined (jersey not on the roster); `jersey` is then shown as #N.
defineProps({
  player: { type: Object, default: null },
  jersey: { type: Number, default: null },
  compact: Boolean,
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
      :class="compact ? 'size-11 ring-2 sm:size-14' : 'size-20 ring-4 sm:size-24'"
      class="mx-auto rounded-full object-cover object-top ring-sunken"
      @error="onImgError"
    />
    <p class="mt-2 inline-flex rounded-md bg-team px-1.5 text-xs font-black tabular-nums text-on-team">#{{ player?.jersey_number ?? jersey }}</p>
    <p v-if="player" :class="compact ? 'line-clamp-2 text-[11px]' : 'text-sm'" class="font-bold leading-tight">{{ player.name }}</p>
  </div>
</template>
