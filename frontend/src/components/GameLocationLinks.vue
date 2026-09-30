<script setup>
import AppIcon from './AppIcon.vue'

defineProps({ address: { type: String, required: true } })

const LINK = 'inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800'
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <a
      :href="'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="'מפות גוגל: ' + address"
      :title="'מפות גוגל: ' + address"
      :class="LINK"
      ><AppIcon name="pin"
    /></a>
    <a
      :href="'https://waze.com/ul?q=' + encodeURIComponent(address) + '&navigate=yes'"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="'וייז: ' + address"
      :title="'וייז: ' + address"
      :class="LINK"
      >וייז</a
    >
  </span>
</template>
