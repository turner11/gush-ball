<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from './AppIcon.vue'
import ImageLightbox from './ImageLightbox.vue'

// The home "תמונות" section: SLOTS tiles that swap one at a time, cross-fading, through the images
// the admin has not hidden from the home page. Clicking a tile opens the viewer over the whole pool.
const props = defineProps({
  images: { type: Array, required: true }, // all of the team's images; hidden ones are filtered here
  mediaTo: { type: String, required: true },
})

const SLOTS = 4
const ROTATE_MS = 5000

const pool = computed(() => props.images.filter((i) => !i.hidden_from_home).sort((a, b) => b.id - a.id))
const rotates = computed(() => pool.value.length > SLOTS)
const shown = ref(pool.value.slice(0, SLOTS))
const rotating = ref(false) // false when there is nothing to rotate or the user prefers reduced motion
const paused = ref(false)
const lightbox = ref(null)
const lightboxImages = computed(() => pool.value.map((i) => ({ url: i.url, alt: i.title })))

// Replace the oldest tile round-robin, so the visible set is a sliding window over the pool: no image shows twice.
let next = SLOTS
let tick = 0
let timer = null
function rotate() {
  if (paused.value) return
  shown.value[tick % SLOTS] = pool.value[next % pool.value.length]
  next++
  tick++
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
onMounted(() => {
  if (!rotates.value || reducedMotion()) return
  rotating.value = true
  timer = setInterval(rotate, ROTATE_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section v-if="pool.length" class="space-y-2">
    <div class="section-header">
      <h2 class="section-title">תמונות</h2>
      <button
        v-if="rotating"
        type="button"
        class="btn-icon ms-auto"
        :aria-label="paused ? 'הפעלת החלפת התמונות' : 'השהיית החלפת התמונות'"
        @click="paused = !paused"
      >
        <AppIcon :name="paused ? 'play' : 'pause'" />
      </button>
      <RouterLink :to="mediaTo" class="section-link" :class="{ 'ms-auto': !rotating }">כל התמונות</RouterLink>
    </div>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <button
        v-for="(image, slot) in shown"
        :key="slot"
        type="button"
        class="relative aspect-square cursor-zoom-in overflow-hidden rounded-xl bg-sunken"
        :aria-label="`הגדלת תמונה: ${image.title}`"
        @click="lightbox.open(pool.indexOf(image), $event)"
      >
        <Transition name="slide">
          <img :key="image.id" :src="image.url" :alt="image.title" loading="lazy" class="absolute inset-0 size-full object-cover" />
        </Transition>
      </button>
    </div>
    <ImageLightbox ref="lightbox" :images="lightboxImages" />
  </section>
</template>
