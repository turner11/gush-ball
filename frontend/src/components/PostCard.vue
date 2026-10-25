<script setup>
defineProps({
  post: { type: Object, required: true },
  clamp: Boolean,
})
</script>

<template>
  <article class="card space-y-2">
    <div class="flex items-center gap-2">
      <h3 class="min-w-0 text-lg font-extrabold">{{ post.title }}</h3>
      <span v-if="post.pinned" class="badge badge-muted shrink-0">נעוץ</span>
    </div>
    <p class="max-w-prose whitespace-pre-line text-muted" :class="{ 'line-clamp-6': clamp }">{{ post.body }}</p>
  </article>
</template>
