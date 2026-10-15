<script setup>
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ErrorView from '../views/ErrorView.vue'

const error = ref(null)
const route = useRoute()

onErrorCaptured((err) => {
  console.error(err)
  // `return false` below stops Vue's app-level handler, so report here (lazy: keeps Sentry out of main chunk)
  if (import.meta.env.VITE_SENTRY_DSN) import('../lib/sentry').then((s) => s.report(err))
  error.value = err
  return false
})

watch(() => route.fullPath, () => (error.value = null))
</script>

<template>
  <ErrorView v-if="error" />
  <slot v-else />
</template>
