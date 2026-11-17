<script setup>
import { onMounted, reactive, ref } from 'vue'

import ImageListEditor from './ImageListEditor.vue'
import { apiFetch } from '../lib/api'

const props = defineProps({ teamId: { type: [Number, String], required: true }, gameId: { type: Number, required: true } })
const emit = defineEmits(['saved'])

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref('')
const justSaved = ref(false)
const form = reactive({ images: [] })

const orNull = (v) => v.trim() || null

function fill(media) {
  form.images = media.images.map((i) => ({ ...i, title: i.title ?? '', title_en: i.title_en ?? '' }))
}

onMounted(async () => {
  try {
    fill(await apiFetch(`/teams/${props.teamId}/games/${props.gameId}`))
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
})

async function onSubmit() {
  saving.value = true
  saveError.value = ''
  justSaved.value = false
  try {
    const body = {
      images: form.images.map((i) => ({ url: i.url, title: orNull(i.title), title_en: orNull(i.title_en) })),
    }
    const media = await apiFetch(`/teams/${props.teamId}/games/${props.gameId}/media`, { method: 'PUT', body })
    fill(media) // the server's normalised values
    emit('saved', media)
    justSaved.value = true
  } catch (e) {
    saveError.value =
      e.status === 422 ? 'יש שדה לא תקין (קישור או אורך טקסט)' : e.status === 403 ? 'אין הרשאה' : 'שגיאה בשמירת המדיה, נסו שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="space-y-2" aria-busy="true">
    <div class="skeleton h-11" />
    <div class="skeleton h-11" />
  </div>
  <p v-else-if="loadError" class="error-text" role="alert">שגיאה בטעינת המשחק, נסו שוב</p>
  <form v-else class="space-y-6" @submit.prevent="onSubmit">
    <ImageListEditor v-model="form.images" />

    <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
    <p aria-live="polite" class="text-sm text-muted">{{ justSaved ? 'המדיה נשמרה' : '' }}</p>
    <div class="sticky-actions">
      <button type="submit" class="btn-primary" :disabled="saving">שמירת מדיה</button>
    </div>
  </form>
</template>
