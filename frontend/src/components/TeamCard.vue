<script setup>
import { RouterLink } from 'vue-router'

defineProps({
  name: { type: String, required: true },
  logoUrl: { type: String, default: null },
  to: { type: String, default: null }, // omitted = information only, not a link
  current: { type: Boolean, default: false },
})
</script>

<template>
  <component
    :is="to ? RouterLink : 'div'"
    :to="to ?? undefined"
    :aria-current="current ? 'true' : undefined"
    :class="['card flex flex-col items-center gap-3 text-center', to && 'transition-colors hover:border-team', current && 'border-team']"
  >
    <img :src="logoUrl || '/logo.jpg'" alt="" class="size-16 rounded-xl bg-white object-contain p-1 sm:size-20" />
    <span class="line-clamp-2 font-bold text-ink">{{ name }}</span>
    <slot />
  </component>
</template>
