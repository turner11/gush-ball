<script setup>
import { formatIsraelDay } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'

defineProps({
  post: { type: Object, required: true },
  clamp: Boolean,
  level: { type: Number, default: 3 }, // heading level, so the card nests under its page's heading
})
</script>

<template>
  <article :id="'post-' + post.id" class="card flex flex-col gap-3 sm:flex-row">
    <div class="min-w-0 flex-1 space-y-2">
      <time v-if="post.created_at" :datetime="post.created_at" class="block text-xs text-muted">{{ formatIsraelDay(post.created_at) }}</time>
      <div class="flex items-center gap-2">
        <component :is="'h' + level" class="min-w-0 text-lg font-extrabold">{{ post.title }}</component>
        <span v-if="post.pinned" class="badge badge-muted shrink-0">נעוץ</span>
      </div>
      <div class="post-body max-w-prose text-muted" :class="{ 'line-clamp-6': clamp }" v-html="renderMarkdown(post.body)" />
    </div>
    <!-- DOM after the text = the card's end side on sm+; order-first stacks it above the text on phones.
         On sm+ the wrapper stretches to the text's height (min-h for short posts) and the image covers it. -->
    <div
      v-if="post.image_url"
      class="relative order-first aspect-video w-full shrink-0 overflow-hidden rounded-xl sm:order-none sm:aspect-auto sm:min-h-40 sm:w-1/3"
    >
      <img :src="post.image_url" alt="" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
    </div>
  </article>
</template>
