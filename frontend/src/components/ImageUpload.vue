<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'

const emit = defineEmits(['uploaded'])
const uploading = ref(false)
const error = ref(null)

async function onChange(event) {
  const input = event.target
  const file = input.files?.[0]
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  error.value = null
  uploading.value = true
  try {
    const res = await apiFetch('/uploads', { method: 'POST', body: fd })
    emit('uploaded', res.url)
  } catch {
    error.value = 'שגיאה בהעלאת הקובץ'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm">
    <input type="file" accept="image/*" :disabled="uploading" class="file:me-2 file:rounded-xl file:border file:border-line file:bg-raised file:px-3 file:min-h-11" @change="onChange" />
    <span v-if="uploading">מעלה...</span>
    <span v-if="error" class="error-text" role="alert">{{ error }}</span>
  </span>
</template>
