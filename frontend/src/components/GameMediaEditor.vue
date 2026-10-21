<script setup>
import { onMounted, reactive, ref } from 'vue'

import ImageUpload from './ImageUpload.vue'
import { apiFetch } from '../lib/api'

const props = defineProps({ teamId: { type: [Number, String], required: true }, gameId: { type: Number, required: true } })
const emit = defineEmits(['saved'])

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref('')
const justSaved = ref(false)
const form = reactive({ videos: [], images: [] })

const orNull = (v) => v.trim() || null

function fill(media) {
  form.videos = media.videos.map((v) => ({ ...v, title_en: v.title_en ?? '' }))
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
      videos: form.videos.map((v) => ({ url: v.url, title: v.title, title_en: orNull(v.title_en) })),
      images: form.images.map((i) => ({ url: i.url, title: orNull(i.title), title_en: orNull(i.title_en) })),
    }
    const media = await apiFetch(`/teams/${props.teamId}/games/${props.gameId}/media`, { method: 'PUT', body })
    fill(media) // the server's normalised values
    emit('saved', media)
    justSaved.value = true
  } catch (e) {
    saveError.value =
      e.status === 422 ? 'יש שדה לא תקין (קישור או אורך טקסט)' : e.status === 403 ? 'אין הרשאה' : 'שגיאה בשמירת המדיה, נסה שוב'
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
  <p v-else-if="loadError" class="error-text" role="alert">שגיאה בטעינת המשחק, נסה שוב</p>
  <form v-else class="space-y-6" @submit.prevent="onSubmit">
    <fieldset class="space-y-3">
      <legend class="section-title">סרטונים</legend>
      <p v-if="!form.videos.length" class="empty-state">אין סרטונים</p>
      <div v-for="(v, i) in form.videos" :key="i" class="grid items-end gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <div>
          <label :for="`video-title-${i}`" class="field-label">כותרת סרטון {{ i + 1 }}</label>
          <input :id="`video-title-${i}`" v-model="v.title" class="field-input" required maxlength="200" />
        </div>
        <div>
          <label :for="`video-title-en-${i}`" class="field-label">כותרת סרטון {{ i + 1 }} (אנגלית)</label>
          <input :id="`video-title-en-${i}`" v-model="v.title_en" class="field-input" maxlength="200" dir="ltr" lang="en" />
        </div>
        <div>
          <label :for="`video-url-${i}`" class="field-label">כתובת סרטון {{ i + 1 }}</label>
          <input :id="`video-url-${i}`" v-model="v.url" type="url" class="field-input" required dir="ltr" inputmode="url" />
        </div>
        <button type="button" class="btn-danger-ghost" :data-test="`remove-video-${i}`" :aria-label="`הסרת סרטון ${i + 1}`" @click="form.videos.splice(i, 1)">הסרה</button>
      </div>
      <button type="button" class="btn-secondary" data-test="add-video" @click="form.videos.push({ title: '', title_en: '', url: '' })">הוספת סרטון</button>
    </fieldset>

    <fieldset class="space-y-3">
      <legend class="section-title">תמונות</legend>
      <p v-if="!form.images.length" class="empty-state">אין תמונות</p>
      <div v-for="(img, i) in form.images" :key="img.url" class="grid items-end gap-2 sm:grid-cols-[4rem_1fr_1fr_auto]">
        <img :src="img.url" alt="" class="size-16 rounded-xl object-cover" />
        <div>
          <label :for="`image-title-${i}`" class="field-label">כותרת תמונה {{ i + 1 }}</label>
          <input :id="`image-title-${i}`" v-model="img.title" class="field-input" maxlength="120" />
        </div>
        <div>
          <label :for="`image-title-en-${i}`" class="field-label">כותרת תמונה {{ i + 1 }} (אנגלית)</label>
          <input :id="`image-title-en-${i}`" v-model="img.title_en" class="field-input" maxlength="120" dir="ltr" lang="en" />
        </div>
        <button type="button" class="btn-danger-ghost" :data-test="`remove-image-${i}`" :aria-label="`הסרת תמונה ${i + 1}`" @click="form.images.splice(i, 1)">הסרה</button>
      </div>
      <ImageUpload label="הוספת תמונה" @uploaded="(url) => form.images.push({ url, title: '', title_en: '' })" />
    </fieldset>

    <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
    <p aria-live="polite" class="text-sm text-muted">{{ justSaved ? 'המדיה נשמרה' : '' }}</p>
    <div class="sticky-actions">
      <button type="submit" class="btn-primary" :disabled="saving">שמירת מדיה</button>
    </div>
  </form>
</template>
