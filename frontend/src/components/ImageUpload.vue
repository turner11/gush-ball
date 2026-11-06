<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'

defineProps({
  label: { type: String, default: undefined },
  accept: { type: String, default: 'image/*' },
  multiple: Boolean,
})
const emit = defineEmits(['uploaded'])
const uploading = ref(false)
const progress = ref('')
const error = ref(null)

// Sequential, so urls are emitted in pick order. A 429 stops the batch: the rest would be refused too.
async function onChange(event) {
  const input = event.target
  const files = [...(input.files ?? [])]
  if (!files.length) return
  error.value = null
  uploading.value = true
  const failed = []
  let reason = null
  try {
    for (const [i, file] of files.entries()) {
      progress.value = files.length > 1 ? `מעלה ${i + 1} מתוך ${files.length}...` : 'מעלה...'
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await apiFetch('/uploads', { method: 'POST', body: fd })
        emit('uploaded', res.url)
      } catch (err) {
        const rateLimited = err.status === 429
        reason = rateLimited ? 'יותר מדי ניסיונות, נסו שוב מאוחר יותר' : 'שגיאה בהעלאת הקובץ'
        failed.push(...(rateLimited ? files.slice(i) : [file]))
        if (rateLimited) break
      }
    }
  } finally {
    uploading.value = false
    input.value = ''
  }
  if (!reason) return
  error.value =
    files.length > 1 ? `${reason}. לא הועלו ${failed.length} מתוך ${files.length}: ${failed.map((f) => f.name).join(', ')}` : reason
}
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-2 text-sm">
    <input type="file" :aria-label="label" :accept="accept" :multiple="multiple" :disabled="uploading" class="file:me-2 file:rounded-xl file:border file:border-line file:bg-raised file:px-3 file:min-h-11" @change="onChange" />
    <span v-if="uploading" role="status">{{ progress }}</span>
    <span v-if="error" class="error-text" role="alert">{{ error }}</span>
  </span>
</template>
