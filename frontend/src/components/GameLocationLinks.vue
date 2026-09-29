<script setup>
defineProps({ address: { type: String, required: true } })
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <a
      :href="'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="'מפות גוגל: ' + address"
      :title="'מפות גוגל: ' + address"
      class="hover:underline"
      >📍</a
    >
    <a
      :href="'https://waze.com/ul?q=' + encodeURIComponent(address) + '&navigate=yes'"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="'וייז: ' + address"
      :title="'וייז: ' + address"
      class="hover:underline"
      >וייז</a
    >
  </span>
</template>
