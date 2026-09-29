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
  <span class="inline-flex items-center gap-2 text-xs">
    <input type="file" accept="image/*" :disabled="uploading" @change="onChange" />
    <span v-if="uploading">מעלה...</span>
    <span v-if="error" class="text-red-600 dark:text-red-400">{{ error }}</span>
  </span>
</template>
