<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'

// `player` may be undefined (jersey not on the roster); `jersey` is then shown as #N.
const props = defineProps({
  player: { type: Object, default: null },
  jersey: { type: Number, default: null },
  compact: Boolean,
})

const SLIDE_MS = 3000
const index = ref(0)
let timer = null

const images = computed(() => props.player?.images ?? [])

function startSlideshow() {
  if (timer || images.value.length < 2) return
  timer = setInterval(() => (index.value = (index.value + 1) % images.value.length), SLIDE_MS)
}
function stopSlideshow() {
  clearInterval(timer)
  timer = null
  index.value = 0
}
onBeforeUnmount(stopSlideshow)

const DEFAULT = '/default-player.png'
// Dead/blocked hotlink -> default; the endsWith guard stops a loop if the default itself fails.
function onImgError(e) {
  if (!e.target.src.endsWith(DEFAULT)) e.target.src = DEFAULT
}
</script>

<template>
  <component
    :is="player?.id && !compact ? RouterLink : 'div'"
    :to="player?.id && !compact ? `/players/${player.id}` : undefined"
    class="block text-center"
    @mouseenter="startSlideshow"
    @mouseleave="stopSlideshow"
  >
    <!-- badge overlaps the photo so names line up whether or not a player has a number -->
    <div class="relative mx-auto w-fit">
      <Transition name="slide" mode="out-in">
      <img
        :key="index"
        :src="images[index]?.url || '/default-player.png'"
        :alt="player?.name ?? ''"
        loading="lazy"
        :class="compact ? 'size-11 ring-2 sm:size-14' : 'size-20 ring-4 sm:size-24'"
        class="rounded-full object-cover object-top ring-sunken"
        @error="onImgError"
      />
      </Transition>
      <p
        v-if="(player?.jersey_number ?? jersey) != null"
        :class="compact ? 'text-[10px]' : 'text-xs'"
        class="absolute inset-x-0 -bottom-1.5 mx-auto w-fit rounded-md bg-team px-1.5 font-black tabular-nums text-on-team ring-2 ring-raised"
      >
        #{{ player?.jersey_number ?? jersey }}
      </p>
    </div>
    <p v-if="player" :class="compact ? 'mt-2.5 line-clamp-2 text-[11px]' : 'mt-3 text-sm'" class="font-bold leading-tight">{{ player.name }}</p>
  </component>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style>
