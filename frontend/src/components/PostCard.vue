<script setup>
defineProps({
  post: { type: Object, required: true },
  clamp: Boolean,
  level: { type: Number, default: 3 }, // heading level, so the card nests under its page's heading
})
</script>

<template>
  <article class="card space-y-2">
    <div class="flex items-center gap-2">
      <component :is="'h' + level" class="min-w-0 text-lg font-extrabold">{{ post.title }}</component>
      <span v-if="post.pinned" class="badge badge-muted shrink-0">נעוץ</span>
    </div>
    <p class="max-w-prose whitespace-pre-line text-muted" :class="{ 'line-clamp-6': clamp }">{{ post.body }}</p>
  </article>
</template>
