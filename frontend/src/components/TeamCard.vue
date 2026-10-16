<script setup>
import { RouterLink } from 'vue-router'

import FavoriteStar from './FavoriteStar.vue'

defineProps({
  name: { type: String, required: true },
  logoUrl: { type: String, default: null },
  to: { type: String, default: null }, // omitted = information only, not a link
  current: { type: Boolean, default: false },
  teamId: { type: Number, default: null }, // set = signed-in users get a favourite star
})
</script>

<template>
  <div class="relative">
  <component
    :is="to ? RouterLink : 'div'"
    :to="to ?? undefined"
    :aria-current="current ? 'true' : undefined"
    :class="['card flex h-full flex-col items-center gap-3 text-center', to && 'transition-colors hover:border-team', current && 'border-team']"
  >
    <img :src="logoUrl || '/logo.jpg'" alt="" class="size-16 rounded-xl bg-white object-contain p-1 sm:size-20" />
    <span class="line-clamp-2 font-bold text-ink">{{ name }}</span>
    <slot />
  </component>
  <FavoriteStar v-if="teamId" :team-id="teamId" :name="name" class="absolute start-1 top-1 text-muted aria-pressed:text-warn" />
  </div>
</template>
