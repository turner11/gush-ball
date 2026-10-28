<script setup>
import { renderMarkdown } from '../lib/markdown'

defineProps({
  post: { type: Object, required: true },
  clamp: Boolean,
  level: { type: Number, default: 3 }, // heading level, so the card nests under its page's heading
})
</script>

<template>
  <article :id="'post-' + post.id" class="card space-y-2">
    <div class="flex items-center gap-2">
      <component :is="'h' + level" class="min-w-0 text-lg font-extrabold">{{ post.title }}</component>
      <span v-if="post.pinned" class="badge badge-muted shrink-0">נעוץ</span>
    </div>
    <div class="post-body max-w-prose text-muted" :class="{ 'line-clamp-6': clamp }" v-html="renderMarkdown(post.body)" />
  </article>
</template>
