<script setup>
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ErrorView from '../views/ErrorView.vue'

const error = ref(null)
const route = useRoute()

onErrorCaptured((err) => {
  error.value = err
  return false
})

watch(() => route.fullPath, () => (error.value = null))
</script>

<template>
  <ErrorView v-if="error" :message="error.message" />
  <slot v-else />
</template>
