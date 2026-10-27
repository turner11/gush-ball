<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { avatarImg, focusStyle, onPlayerImgError } from '../lib/playerPhoto'

// `player` may be undefined (jersey not on the roster); `jersey` is then shown as #N.
const props = defineProps({
  player: { type: Object, default: null },
  jersey: { type: Number, default: null },
  compact: Boolean,
  // the team's tagged images; only those tagging this player alone join the slideshow
  teamImages: { type: Array, default: () => [] },
})

const SLIDE_MS = 3000
const START_DELAY_MS = 1000
const index = ref(0)
const hovered = ref(false)
let timer = null
let delay = null

const own = computed(() => props.player?.images ?? [])
const slides = computed(() => [
  ...own.value,
  ...props.teamImages.filter((i) => i.player_ids.length === 1 && i.player_ids[0] === props.player?.id),
])

function startSlideshow() {
  hovered.value = true
  if (delay || slides.value.length < 2) return
  const advance = () => (index.value = (index.value + 1) % slides.value.length)
  delay = setTimeout(() => {
    advance()
    timer = setInterval(advance, SLIDE_MS)
  }, START_DELAY_MS)
}
function stopSlideshow() {
  clearTimeout(delay)
  delay = null
  clearInterval(timer)
  timer = null
  index.value = 0
  hovered.value = false
}
onBeforeUnmount(stopSlideshow)
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
      <div
        :class="compact ? 'size-11 ring-2 sm:size-14' : 'size-20 ring-4 sm:size-24'"
        class="overflow-hidden rounded-full ring-sunken"
      >
        <img
          v-bind="avatarImg(own[0])"
          :alt="player?.name ?? ''"
          loading="lazy"
          class="size-full object-cover object-top"
          @error="onPlayerImgError"
        />
      </div>
      <p
        v-if="player?.is_coach || (player?.jersey_number ?? jersey) != null"
        :class="compact ? 'text-[10px]' : 'text-xs'"
        class="absolute inset-x-0 -bottom-1.5 mx-auto w-fit rounded-md bg-team px-1.5 font-black tabular-nums text-on-team ring-2 ring-raised"
      >
        <template v-if="player?.is_coach">מאמן</template>
        <template v-else>#{{ player?.jersey_number ?? jersey }}</template>
      </p>
    </div>
    <!-- on hover the slideshow fills the whole card: the nearest positioned ancestor, i.e. the caller's `relative overflow-hidden` card -->
    <Transition v-if="hovered && slides.length && !compact" name="slide">
      <img
        :key="index"
        :src="slides[index].url"
        alt=""
        data-testid="slide"
        :style="focusStyle(slides[index])"
        class="absolute inset-0 size-full object-cover object-top"
        @error="onPlayerImgError"
      />
    </Transition>
    <p v-if="player" :class="compact ? 'mt-2.5 line-clamp-2 text-[11px]' : 'mt-3 text-sm'" class="font-bold leading-tight">{{ player.name }}</p>
  </component>
</template>
