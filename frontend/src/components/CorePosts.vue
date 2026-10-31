<script setup>
import { renderMarkdown } from '../lib/markdown'

// Core posts (#605): lasting page content, each its own section under About. Renders sibling sections; the parent spaces them.
defineProps({ posts: { type: Array, required: true } })
</script>

<template>
  <template v-for="post in posts.filter((p) => p.is_core)" :key="post.id">
    <section class="space-y-3">
      <h2 class="section-title">{{ post.title }}</h2>
      <div class="card flex flex-col gap-3 sm:flex-row">
        <div class="post-body min-w-0 max-w-prose flex-1" v-html="renderMarkdown(post.body)" />
        <img
          v-if="post.image_url"
          :src="post.image_url"
          alt=""
          loading="lazy"
          class="order-first h-auto max-h-96 w-full rounded-xl bg-raised object-contain sm:order-none sm:w-1/3 sm:shrink-0 sm:self-start"
        />
      </div>
    </section>
  </template>
</template>
