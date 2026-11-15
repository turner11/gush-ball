<script setup>
import { reactive, ref } from 'vue'

import AppIcon from './AppIcon.vue'
import VideoSegmentFields from './VideoSegmentFields.vue'
import { apiFetch } from '../lib/api'

// The page already loaded the list, so it comes in as a prop (no fetch, no loading state of its own).
const props = defineProps({
  teamId: { type: [Number, String], required: true },
  gameId: { type: Number, required: true },
  items: { type: Array, required: true },
})
const emit = defineEmits(['saved'])

const saving = ref(false)
const saveError = ref('')
const form = reactive({ items: [] })

const orNull = (v) => v.trim() || null

function fill(items) {
  form.items = items.map((i) => ({ title: i.title, text: i.text ?? '', url: i.url ?? '' }))
}
fill(props.items) // once, by design: the parent closes the editor on save

function move(i, delta) {
  const list = form.items
  ;[list[i], list[i + delta]] = [list[i + delta], list[i]]
}

async function onSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const body = form.items.map((i) => ({ title: i.title, text: orNull(i.text), url: orNull(i.url) }))
    const items = await apiFetch(`/teams/${props.teamId}/games/${props.gameId}/briefing`, { method: 'PUT', body })
    emit('saved', items)
  } catch (e) {
    saveError.value =
      e.status === 422 ? 'יש שדה לא תקין (קישור או אורך טקסט)' : e.status === 403 ? 'אין הרשאה' : 'שגיאה בשמירת התדריך, נסו שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="onSubmit">
    <p v-if="!form.items.length" class="empty-state">אין פריטים בתדריך</p>
    <div v-for="(item, i) in form.items" :key="i" class="grid gap-3 sm:grid-cols-2">
      <div>
        <label :for="`briefing-title-${i}`" class="field-label">כותרת פריט {{ i + 1 }}</label>
        <input :id="`briefing-title-${i}`" v-model="item.title" class="field-input" required maxlength="200" />
      </div>
      <div>
        <label :for="`briefing-url-${i}`" class="field-label">כתובת סרטון {{ i + 1 }} (לא חובה)</label>
        <input :id="`briefing-url-${i}`" v-model="item.url" type="url" class="field-input" dir="ltr" inputmode="url" />
      </div>
      <VideoSegmentFields v-model="item.url" :id="`briefing-segment-${i}`" class="sm:col-span-2" />
      <div class="sm:col-span-2">
        <label :for="`briefing-text-${i}`" class="field-label">טקסט {{ i + 1 }}</label>
        <textarea :id="`briefing-text-${i}`" v-model="item.text" class="field-input" rows="3" maxlength="2000"></textarea>
      </div>
      <div class="flex flex-wrap gap-1 sm:col-span-2">
        <button type="button" class="btn-ghost" :aria-label="`הזזה למעלה ${i + 1}`" :disabled="i === 0" @click="move(i, -1)">
          <AppIcon name="chevron" class="rotate-180" />
        </button>
        <button type="button" class="btn-ghost" :aria-label="`הזזה למטה ${i + 1}`" :disabled="i === form.items.length - 1" @click="move(i, 1)">
          <AppIcon name="chevron" />
        </button>
        <button type="button" class="btn-danger-ghost" :aria-label="`הסרת פריט ${i + 1}`" @click="form.items.splice(i, 1)">הסרה</button>
      </div>
    </div>
    <button type="button" class="btn-secondary" data-test="add-item" @click="form.items.push({ title: '', text: '', url: '' })">הוספת פריט</button>

    <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
    <div class="sticky-actions">
      <button type="submit" class="btn-primary" :disabled="saving">שמירת תדריך</button>
    </div>
  </form>
</template>
