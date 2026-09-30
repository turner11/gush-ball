<script setup>
import { onMounted, ref } from 'vue'

import AppIcon from '../components/AppIcon.vue'
import { apiFetch } from '../lib/api'

// `column` is the (shorter) table header; `numeric` fields are sent as numbers.
const FIELDS = [
  { key: 'league_name', label: 'ליגה', column: 'ליגה', type: 'text' },
  { key: 'team_name', label: 'קבוצה', column: 'קבוצה', type: 'text' },
  { key: 'rank', label: 'דירוג', column: 'דירוג', type: 'number' },
  { key: 'played', label: 'משחקים', column: 'משחקים', type: 'number' },
  { key: 'won', label: 'נצחונות', column: 'נצחונות', type: 'number' },
  { key: 'lost', label: 'הפסדים', column: 'הפסדים', type: 'number' },
  { key: 'points_for', label: 'נקודות זכות', column: "נק' זכות", type: 'number' },
  { key: 'points_against', label: 'נקודות חובה', column: "נק' חובה", type: 'number' },
  { key: 'points', label: 'נקודות', column: 'נקודות', type: 'number' },
]

function emptyForm() {
  return Object.fromEntries(FIELDS.map((f) => [f.key, '']))
}

const rows = ref([])
const editing = ref(null)
const form = ref(emptyForm())
const error = ref(null)

async function loadRows() {
  rows.value = await apiFetch('/standings')
}

onMounted(loadRows)

function resetForm() {
  editing.value = null
  form.value = emptyForm()
}

const formEl = ref(null)

function startEdit(row) {
  editing.value = row
  form.value = { ...row }
  formEl.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

function buildPayload() {
  return Object.fromEntries(
    FIELDS.map(({ key, type }) => {
      const value = form.value[key]
      return [key, type === 'number' ? Number(value || 0) : value]
    }),
  )
}

async function onSubmit() {
  const payload = buildPayload()

  error.value = null
  try {
    if (editing.value) {
      const updated = await apiFetch(`/standings/${editing.value.id}`, { method: 'PATCH', body: payload })
      const idx = rows.value.findIndex((r) => r.id === updated.id)
      if (idx !== -1) rows.value[idx] = updated
    } else {
      const created = await apiFetch('/standings', { method: 'POST', body: payload })
      rows.value.push(created)
    }

    resetForm()
  } catch {
    error.value = 'שגיאה בשמירת השורה, נסה שוב'
  }
}

async function onDelete(row) {
  error.value = null
  try {
    await apiFetch(`/standings/${row.id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== row.id)
  } catch {
    error.value = 'שגיאה במחיקת השורה, נסה שוב'
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="page-title">ניהול טבלת ליגה</h1>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr class="table-header-row">
              <th v-for="field in FIELDS" :key="field.key">{{ field.column }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="table-row">
              <td v-for="field in FIELDS" :key="field.key" :data-label="field.column">{{ row[field.key] }}</td>
              <td class="justify-end">
                <span class="inline-flex gap-1">
                  <button type="button" class="btn-ghost" @click="startEdit(row)">ערוך</button>
                  <button type="button" class="btn-danger-ghost" @click="onDelete(row)">מחק</button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <form id="standing-form" ref="formEl" class="card scroll-mt-24 space-y-3 lg:sticky lg:top-20" @submit.prevent="onSubmit">
        <h2 class="section-title">{{ editing ? 'עריכת שורה' : 'הוספת שורה' }}</h2>

        <p v-if="error" class="error-text" role="alert">{{ error }}</p>

        <div class="grid grid-cols-2 gap-3">
          <div v-for="field in FIELDS" :key="field.key" :class="{ 'col-span-2': ['league_name', 'team_name'].includes(field.key) }">
            <label :for="`standing-${field.key.replaceAll('_', '-')}`" class="field-label">{{ field.label }}</label>
            <input
              :id="`standing-${field.key.replaceAll('_', '-')}`"
              v-model="form[field.key]"
              :type="field.type"
              required
              class="field-input"
            />
          </div>
        </div>

        <div class="flex gap-2">
          <button type="submit" class="btn-primary">
            {{ editing ? 'שמירה' : 'הוספה' }}
          </button>
          <button v-if="editing" type="button" class="btn-secondary" @click="resetForm">
            ביטול
          </button>
        </div>
      </form>
    </div>
    <a href="#standing-form" class="fab lg:hidden" aria-label="הוספת שורה"><AppIcon name="plus" /></a>
  </section>
</template>
