<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from './AppIcon.vue'

// The home hero (#560): up to 3 featured posts (title only; a post's image_url, when set, is the slide background #562), one slide at a time, auto-advancing every 7s with dots and a pause button. The CTA deep-links to the post's game page when it has one (#584), else to the posts page.
const props = defineProps({
  items: { type: Array, required: true }, // from featuredPosts(): { post, label }
  base: { type: String, required: true }, // the team's base path, e.g. /team_a
})

const ROTATE_MS = 7000
const index = ref(0)
const paused = ref(false)
const reducedMotion = ref(false)
const multiple = computed(() => props.items.length > 1)
const rotating = computed(() => multiple.value && !reducedMotion.value && !paused.value)
const current = computed(() => props.items[index.value] ?? props.items[0])
const readMoreTo = computed(() => {
  const { id, game_id } = current.value.post
  return game_id ? `${props.base}/games/${game_id}#post-${id}` : `${props.base}/posts#post-${id}`
})

watch(() => props.items, () => (index.value = 0)) // posts reload after editing

function select(i) {
  index.value = i
  paused.value = true // the user took control
}

let timer = null
onMounted(() => {
  reducedMotion.value = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  timer = setInterval(() => rotating.value && (index.value = (index.value + 1) % props.items.length), ROTATE_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section v-if="current" aria-roledescription="carousel" aria-label="עדכונים נבחרים" :aria-live="rotating ? 'off' : 'polite'" :class="current.post.image_url ? 'bg-black text-white' : 'bg-team text-on-team'" class="relative isolate min-w-0 overflow-hidden rounded-2xl p-6 shadow-card sm:p-10">
    <template v-if="current.post.image_url">
      <Transition name="flash">
        <img :key="current.post.id" :src="current.post.image_url" alt="" class="absolute inset-0 -z-10 size-full object-cover" />
      </Transition>
      <div class="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/60 to-black/25" aria-hidden="true" />
    </template>
    <Transition name="flash" mode="out-in">
      <div
        :key="current.post.id"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${index + 1} מתוך ${items.length}`"
        class="flex min-h-56 flex-col items-start justify-end gap-3 sm:min-h-64"
      >
        <p v-if="current.label" class="text-sm font-bold">{{ current.label }}</p>
        <h2 class="break-words text-2xl font-black leading-tight sm:text-4xl">{{ current.post.title }}</h2>
        <RouterLink :to="readMoreTo" class="btn-secondary">להמשך קריאה</RouterLink>
      </div>
    </Transition>
    <div v-if="multiple" class="mt-2 flex items-center gap-1">
      <button
        v-for="(item, i) in items"
        :key="item.post.id"
        type="button"
        class="grid size-11 place-items-center"
        :aria-label="`עדכון ${i + 1}: ${item.post.title}`"
        :aria-current="i === index ? 'true' : undefined"
        @click="select(i)"
      >
        <span v-if="i === index" class="h-2 w-6 rounded-full bg-current" />
        <span v-else class="size-2 rounded-full border-2 border-current" />
      </button>
      <button
        v-if="!reducedMotion"
        type="button"
        class="btn-icon ms-auto"
        :aria-label="paused ? 'הפעלת החלפת העדכונים' : 'השהיית החלפת העדכונים'"
        @click="paused = !paused"
      >
        <AppIcon :name="paused ? 'play' : 'pause'" />
      </button>
    </div>
  </section>
</template>
