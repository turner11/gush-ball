<script setup>
import { computed, onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import ConfirmDialog from './ConfirmDialog.vue'
import PracticeRow from './PracticeRow.vue'

// Practice CRUD for one team (#440). Mounted with :key="team.id", so a team switch remounts it.
const props = defineProps({ team: { type: Object, required: true } })

const base = `/teams/${props.team.id}/practices`
const SAVE_ERROR = 'שגיאה בשמירת האימון, נסו שוב'

function emptyForm() {
  return { starts_at: '', duration_minutes: 90, location: props.team.home_court_address ?? '', notes: '', repeat_weekly_until: '', cancelled: false }
}

const practices = ref([])
const loading = ref(true)
const listError = ref(null)
const error = ref(null)
const added = ref(null)
const editing = ref(null)
const form = ref(emptyForm())
const pendingDelete = ref(null)
const confirmingAll = ref(false)

// Backend rejects a series longer than 366 days from the first practice.
const repeatMax = computed(() => {
  const start = form.value.starts_at.slice(0, 10)
  return start ? new Date(Date.parse(start) + 366 * 864e5).toISOString().slice(0, 10) : undefined
})
// Past practices are clutter in the admin list.
const upcoming = computed(() => practices.value.filter((p) => new Date(p.starts_at) >= new Date()))

async function load() {
  loading.value = true
  listError.value = null
  try {
    practices.value = await apiFetch(base)
  } catch {
    practices.value = []
    listError.value = 'שגיאה בטעינת האימונים'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function resetForm() {
  editing.value = null
  form.value = emptyForm()
}

function startEdit(practice) {
  editing.value = practice
  added.value = null
  form.value = {
    starts_at: practice.starts_at.slice(0, 16),
    duration_minutes: practice.duration_minutes,
    location: practice.location ?? '',
    notes: practice.notes ?? '',
    repeat_weekly_until: '',
    cancelled: practice.cancelled,
  }
}

function replace(updated) {
  practices.value = practices.value.map((p) => (p.id === updated.id ? updated : p))
  practices.value.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

async function onSubmit() {
  error.value = null
  added.value = null
  const body = {
    starts_at: form.value.starts_at,
    duration_minutes: Number(form.value.duration_minutes),
    location: form.value.location || null,
    notes: form.value.notes || null,
  }
  try {
    if (editing.value) {
      replace(await apiFetch(`${base}/${editing.value.id}`, { method: 'PATCH', body: { ...body, cancelled: form.value.cancelled } }))
    } else {
      const created = await apiFetch(base, { method: 'POST', body: { ...body, repeat_weekly_until: form.value.repeat_weekly_until || null } })
      practices.value = [...practices.value, ...created].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      if (created.length > 1) added.value = `נוספו ${created.length} אימונים`
    }
    resetForm()
  } catch {
    error.value = SAVE_ERROR
  }
}

async function toggleCancelled(practice) {
  error.value = null
  try {
    replace(await apiFetch(`${base}/${practice.id}`, { method: 'PATCH', body: { cancelled: !practice.cancelled } }))
  } catch {
    error.value = SAVE_ERROR
  }
}

async function onDelete(practice) {
  pendingDelete.value = null
  error.value = null
  try {
    await apiFetch(`${base}/${practice.id}`, { method: 'DELETE' })
    practices.value = practices.value.filter((p) => p.id !== practice.id)
  } catch {
    error.value = SAVE_ERROR
  }
}

async function onDeleteAll() {
  confirmingAll.value = false
  error.value = null
  try {
    await apiFetch(`${base}/upcoming`, { method: 'DELETE' })
    practices.value = practices.value.filter((p) => !upcoming.value.includes(p))
  } catch {
    error.value = SAVE_ERROR
  }
}
</script>

<template>
  <section id="practices" class="scroll-mt-24 space-y-6">
    <h2 class="section-title">אימונים</h2>
    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="min-w-0 space-y-4">
        <div v-if="loading" class="space-y-3" aria-busy="true">
          <div class="skeleton h-12" />
          <div class="skeleton h-12" />
        </div>
        <p v-else-if="listError" class="error-text" role="alert">{{ listError }}</p>
        <p v-else-if="!upcoming.length" class="empty-state">אין אימונים קרובים. הוסיפו אימון בטופס.</p>
        <template v-else>
          <button type="button" class="btn-danger-ghost" @click="confirmingAll = true">מחיקת כל האימונים הקרובים</button>
          <ol class="card divide-y divide-line overflow-hidden p-0">
            <PracticeRow v-for="practice in upcoming" :key="practice.id" :practice="practice">
              <template #actions>
                <button type="button" class="btn-ghost" :aria-label="'עריכה: האימון ב' + formatDateTime(practice.starts_at)" @click="startEdit(practice)">עריכה</button>
                <button type="button" class="btn-ghost" :aria-label="(practice.cancelled ? 'שחזור' : 'ביטול') + ': האימון ב' + formatDateTime(practice.starts_at)" @click="toggleCancelled(practice)">{{ practice.cancelled ? 'שחזור' : 'ביטול אימון' }}</button>
                <button type="button" class="btn-danger-ghost" :aria-label="'מחיקה: האימון ב' + formatDateTime(practice.starts_at)" @click="pendingDelete = practice">מחיקה</button>
              </template>
            </PracticeRow>
          </ol>
        </template>
      </div>

      <form class="card space-y-3 lg:sticky lg:top-20" @submit.prevent="onSubmit">
        <h3 class="section-title">{{ editing ? 'עריכת אימון' : 'הוספת אימון' }}</h3>
        <p v-if="added" role="status" class="text-sm">{{ added }}</p>

        <div>
          <label for="practice-starts-at" class="field-label">תאריך ושעה</label>
          <input id="practice-starts-at" v-model="form.starts_at" type="datetime-local" required class="field-input" />
        </div>
        <div>
          <label for="practice-duration" class="field-label">משך (דקות)</label>
          <input id="practice-duration" v-model="form.duration_minutes" type="number" min="15" max="480" required class="field-input" />
        </div>
        <div>
          <label for="practice-location" class="field-label">מקום</label>
          <input id="practice-location" v-model="form.location" type="text" maxlength="300" class="field-input" />
        </div>
        <div>
          <label for="practice-notes" class="field-label">הערות</label>
          <textarea id="practice-notes" v-model="form.notes" maxlength="2000" class="field-input"></textarea>
        </div>
        <div v-if="!editing">
          <label for="practice-repeat" class="field-label">חזרה שבועית עד</label>
          <input id="practice-repeat" v-model="form.repeat_weekly_until" type="date" :min="form.starts_at.slice(0, 10)" :max="repeatMax" class="field-input" />
        </div>
        <label v-else class="flex min-h-11 items-center gap-2">
          <input v-model="form.cancelled" type="checkbox" class="size-5" />
          <span class="field-label">בוטל</span>
        </label>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>
        <div class="flex gap-2">
          <button type="submit" class="btn-primary">{{ editing ? 'שמירה' : 'הוספה' }}</button>
          <button v-if="editing" type="button" class="btn-secondary" @click="resetForm">ביטול</button>
        </div>
      </form>
    </div>

    <ConfirmDialog
      :open="pendingDelete !== null"
      message="למחוק את האימון?"
      @update:open="(value) => !value && (pendingDelete = null)"
      @confirm="onDelete(pendingDelete)"
    />
    <ConfirmDialog
      :open="confirmingAll"
      :message="`למחוק ${upcoming.length} אימונים קרובים?`"
      @update:open="(value) => (confirmingAll = value)"
      @confirm="onDeleteAll"
    />
  </section>
</template>
