<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { formatIsraelDay } from '../lib/format'
import AppIcon from './AppIcon.vue'
import ImageLightbox from './ImageLightbox.vue'

// The home "תמונות" section: SLOTS tiles that swap one at a time, cross-fading, through the images
// the admin has not hidden from the home page, every 3s by default (build-time VITE_HOME_SLIDE_MS, min 1000). Clicking a tile opens the viewer over the whole pool.
const props = defineProps({
  images: { type: Array, required: true }, // all of the team's images; hidden ones are filtered here
  mediaTo: { type: String, required: true },
})

const SLOTS = 4
const DEFAULT_ROTATE_MS = 3000
function rotateMs() {
  const ms = Number(import.meta.env.VITE_HOME_SLIDE_MS)
  // ponytail: floor of 1000 ms stops 0/negative/typos from spinning setInterval (and keeps flashes under 3/s)
  return Number.isFinite(ms) && ms >= 1000 ? ms : DEFAULT_ROTATE_MS
}

// The API sends newest first; shuffle each run of images from the same Israel day. Undated (legacy) images stay put.
function shuffledWithinDays(images) {
  const out = [...images]
  const day = (i) => (i.created_at ? formatIsraelDay(i.created_at) : null)
  for (let start = 0, end; start < out.length; start = end) {
    end = start + 1
    while (end < out.length && day(out[end]) !== null && day(out[end]) === day(out[start])) end++
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(Math.random() * (i - start + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
  }
  return out
}

const pool = computed(() => shuffledWithinDays(props.images.filter((i) => !i.hidden_from_home)))
const rotates = computed(() => pool.value.length > SLOTS)
const shown = ref(pool.value.slice(0, SLOTS))
const rotating = ref(false) // false when there is nothing to rotate or the user prefers reduced motion
const paused = ref(false)
const lightbox = ref(null)
const altOf = (image) => image.title || 'תמונה של הקבוצה' // titles may be ''
const lightboxImages = computed(() => pool.value.map((i) => ({ url: i.url, alt: altOf(i) })))

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
  timer = setInterval(rotate, rotateMs())
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
        class="relative aspect-square cursor-zoom-in overflow-hidden rounded-xl bg-sunken image-pop"
        :aria-label="`הגדלת תמונה: ${altOf(image)}`"
        @click="lightbox.open(pool.indexOf(image), $event)"
      >
        <Transition name="flash">
          <img :key="image.id" :src="image.url" :alt="altOf(image)" loading="lazy" class="absolute inset-0 size-full object-cover" />
        </Transition>
      </button>
    </div>
    <ImageLightbox ref="lightbox" :images="lightboxImages" />
  </section>
</template>
