<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'

// The page already loaded the list, so it comes in as a prop (no fetch, no loading state of its own).
const props = defineProps({
  endpoint: { type: String, required: true }, // PUT path without /api
  urls: { type: Array, required: true },
})
const emit = defineEmits(['saved'])

const MAX_VIDEOS = 10 // matches the backend cap
const saving = ref(false)
const saveError = ref('')
const list = ref([...props.urls]) // once, by design: the parent closes the editor on save

async function onSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const body = list.value.map((u) => u.trim()).filter(Boolean)
    emit('saved', await apiFetch(props.endpoint, { method: 'PUT', body }))
  } catch (e) {
    saveError.value =
      e.status === 422 ? 'יש קישור לא תקין (רק סרטוני YouTube)' : e.status === 403 ? 'אין הרשאה' : 'שגיאה בשמירת הצילומים, נסו שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <p v-if="!list.length" class="empty-state">עדיין לא נוספו צילומי משחק.</p>
    <div v-for="(_, i) in list" :key="i" class="space-y-2">
      <label :for="`footage-url-${i}`" class="field-label">כתובת סרטון {{ i + 1 }}</label>
      <div class="flex gap-2">
        <input :id="`footage-url-${i}`" v-model="list[i]" type="url" class="field-input" dir="ltr" inputmode="url" />
        <button type="button" class="btn-danger-ghost shrink-0" :aria-label="`הסרת סרטון ${i + 1}`" @click="list.splice(i, 1)">הסרה</button>
      </div>
    </div>
    <button v-if="list.length < MAX_VIDEOS" type="button" class="btn-ghost" data-test="add-video" @click="list.push('')">הוספת סרטון</button>

    <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
    <div class="sticky-actions">
      <button type="submit" class="btn-primary" :disabled="saving">שמירת צילומים</button>
    </div>
  </form>
</template>
