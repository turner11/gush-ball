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
  <div class="text-center">
    <!-- badge overlaps the photo so names line up whether or not a player has a number -->
    <div class="relative mx-auto w-fit">
      <img
        :src="player?.images?.[0]?.url || '/default-player.png'"
        :alt="player?.name ?? ''"
        loading="lazy"
        :class="compact ? 'size-11 ring-2 sm:size-14' : 'size-20 ring-4 sm:size-24'"
        class="rounded-full object-cover object-top ring-sunken"
        @error="onImgError"
      />
      <p
        v-if="(player?.jersey_number ?? jersey) != null"
        :class="compact ? 'text-[10px]' : 'text-xs'"
        class="absolute inset-x-0 -bottom-1.5 mx-auto w-fit rounded-md bg-team px-1.5 font-black tabular-nums text-on-team ring-2 ring-raised"
      >
        #{{ player?.jersey_number ?? jersey }}
      </p>
    </div>
    <p v-if="player" :class="compact ? 'mt-2.5 line-clamp-2 text-[11px]' : 'mt-3 text-sm'" class="font-bold leading-tight">{{ player.name }}</p>
  </div>
</template>
