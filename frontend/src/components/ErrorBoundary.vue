<script setup>
import { onErrorCaptured, ref } from 'vue'

import ErrorView from '../views/ErrorView.vue'

const error = ref(null)

onErrorCaptured((err) => {
  error.value = err
  return false
})
</script>

<template>
  <ErrorView v-if="error" :message="error.message" />
  <slot v-else />
</template>
