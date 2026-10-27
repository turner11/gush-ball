<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from './AppIcon.vue'

// The home hero (#560): up to 3 featured posts, one slide at a time, auto-advancing every 7s with dots and a pause button.
const props = defineProps({
  items: { type: Array, required: true }, // from featuredPosts(): { post, label }
  postsTo: { type: String, required: true },
})

const ROTATE_MS = 7000
const index = ref(0)
const paused = ref(false)
const reducedMotion = ref(false)
const multiple = computed(() => props.items.length > 1)
const rotating = computed(() => multiple.value && !reducedMotion.value && !paused.value)
const current = computed(() => props.items[index.value] ?? props.items[0])

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
  <section v-if="current" aria-roledescription="carousel" aria-label="עדכונים נבחרים" class="min-w-0 rounded-2xl bg-team p-6 text-on-team shadow-card sm:p-10">
    <Transition name="flash" mode="out-in">
      <div
        :key="current.post.id"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${index + 1} מתוך ${items.length}`"
        :aria-live="rotating ? 'off' : 'polite'"
        class="flex min-h-56 flex-col items-start justify-end gap-3 sm:min-h-64"
      >
        <p v-if="current.label" class="text-sm font-bold">{{ current.label }}</p>
        <h2 class="break-words text-2xl font-black leading-tight sm:text-4xl">{{ current.post.title }}</h2>
        <p class="line-clamp-3 max-w-prose whitespace-pre-line break-words sm:line-clamp-4">{{ current.post.body }}</p>
        <RouterLink :to="`${postsTo}#post-${current.post.id}`" class="btn-secondary">להמשך קריאה</RouterLink>
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
