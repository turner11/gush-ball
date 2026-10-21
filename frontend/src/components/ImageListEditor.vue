<script setup>
import ImageUpload from './ImageUpload.vue'

// v-model: [{ url, title, title_en }] (titles '' when empty; callers map '' to null on save).
const props = defineProps({ modelValue: { type: Array, required: true } })
const emit = defineEmits(['update:modelValue'])

const edit = (i, key, value) => emit('update:modelValue', props.modelValue.map((img, j) => (j === i ? { ...img, [key]: value } : img)))
const remove = (i) => emit('update:modelValue', props.modelValue.filter((_, j) => j !== i))
const add = (url) => emit('update:modelValue', [...props.modelValue, { url, title: '', title_en: '' }])
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="section-title">תמונות</legend>
    <p v-if="!modelValue.length" class="empty-state">אין תמונות</p>
    <div v-for="(img, i) in modelValue" :key="img.url" class="grid items-end gap-2 sm:grid-cols-[4rem_1fr_1fr_auto]">
      <img :src="img.url" alt="" class="size-16 rounded-xl object-cover" />
      <div>
        <label :for="`image-title-${i}`" class="field-label">כותרת תמונה {{ i + 1 }}</label>
        <input :id="`image-title-${i}`" :value="img.title" class="field-input" maxlength="120" @input="edit(i, 'title', $event.target.value)" />
      </div>
      <div>
        <label :for="`image-title-en-${i}`" class="field-label">כותרת תמונה {{ i + 1 }} (אנגלית)</label>
        <input :id="`image-title-en-${i}`" :value="img.title_en" class="field-input" maxlength="120" dir="ltr" lang="en" @input="edit(i, 'title_en', $event.target.value)" />
      </div>
      <button type="button" class="btn-danger-ghost" :data-test="`remove-image-${i}`" :aria-label="`הסרת תמונה ${i + 1}`" @click="remove(i)">הסרה</button>
    </div>
    <ImageUpload label="הוספת תמונה" @uploaded="add" />
  </fieldset>
</template>
