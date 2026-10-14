<script setup>
import { captureException } from '@sentry/vue'
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ErrorView from '../views/ErrorView.vue'

const error = ref(null)
const route = useRoute()

onErrorCaptured((err) => {
  console.error(err)
  captureException(err) // `return false` below stops Vue's app-level handler, so report here
  error.value = err
  return false
})

watch(() => route.fullPath, () => (error.value = null))
</script>

<template>
  <ErrorView v-if="error" />
  <slot v-else />
</template>
