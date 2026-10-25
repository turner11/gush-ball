<script setup>
import { ref } from 'vue'

import ImageLightbox from './ImageLightbox.vue'

// Square-thumbnail grid that opens each image in the in-page viewer.
defineProps({
  images: { type: Array, required: true }, // [{ url, title }]
  fallbackAlt: { type: String, required: true }, // alt/label for an untitled image
})
const lightbox = ref(null)
</script>

<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
    <figure v-for="(img, i) in images" :key="i" class="space-y-1">
      <button type="button" class="block w-full cursor-zoom-in" :aria-label="`הגדלת תמונה: ${img.title || fallbackAlt}`" @click="lightbox.open(i, $event)">
        <img :src="img.url" :alt="img.title || fallbackAlt" loading="lazy" class="aspect-square w-full rounded-xl object-cover" />
      </button>
      <figcaption v-if="img.title" class="text-sm text-muted">{{ img.title }}</figcaption>
    </figure>
    <ImageLightbox ref="lightbox" :images="images.map((i) => ({ url: i.url, alt: i.title || fallbackAlt }))" />
  </div>
</template>
