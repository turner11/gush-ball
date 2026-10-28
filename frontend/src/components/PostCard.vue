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
  <article :id="'post-' + post.id" class="card flex flex-col gap-3 sm:flex-row sm:items-start">
    <div class="min-w-0 flex-1 space-y-2">
      <time v-if="post.created_at" :datetime="post.created_at" class="block text-xs text-muted">{{ formatIsraelDay(post.created_at) }}</time>
      <div class="flex items-center gap-2">
        <component :is="'h' + level" class="min-w-0 text-lg font-extrabold">{{ post.title }}</component>
        <span v-if="post.pinned" class="badge badge-muted shrink-0">נעוץ</span>
      </div>
      <div class="post-body max-w-prose text-muted" :class="{ 'line-clamp-6': clamp }" v-html="renderMarkdown(post.body)" />
    </div>
    <!-- DOM after the text = the card's end side on sm+; order-first stacks it above the text on phones -->
    <img
      v-if="post.image_url"
      :src="post.image_url"
      alt=""
      loading="lazy"
      class="order-first aspect-video w-full rounded-xl object-cover sm:order-none sm:w-56 sm:shrink-0"
    />
  </article>
</template>
