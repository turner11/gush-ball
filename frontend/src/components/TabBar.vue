<script setup>
import { RouterLink } from 'vue-router'

import AppIcon from './AppIcon.vue'

defineProps({ items: { type: Array, required: true } })
</script>

<template>
  <nav
    data-testid="tab-bar"
    aria-label="ניווט ראשי"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
  >
    <ul class="mx-auto grid max-w-lg auto-cols-fr grid-flow-col">
      <li v-for="item in items" :key="item.label">
        <RouterLink
          :to="item.to"
          :active-class="item.exact ? '' : 'tab-active'"
          exact-active-class="tab-active"
          class="relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted [&.tab-active]:text-ink [&.tab-active]:after:absolute [&.tab-active]:after:top-0 [&.tab-active]:after:h-[3px] [&.tab-active]:after:w-8 [&.tab-active]:after:rounded-b-full [&.tab-active]:after:bg-team"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
