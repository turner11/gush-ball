<script setup>
defineProps({ message: { type: String, required: true } })
defineEmits(['retry'])
</script>

<template>
  <div class="space-y-3">
    <p class="error-text" role="alert">{{ message }}</p>
    <button type="button" class="btn-secondary" @click="$emit('retry')">נסו שוב</button>
  </div>
</template>
