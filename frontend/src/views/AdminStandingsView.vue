<script setup>
import { onMounted, ref } from 'vue'

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

function startEdit(row) {
  editing.value = row
  form.value = { ...row }
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

    <table class="w-full text-start">
      <thead>
        <tr class="table-header-row">
          <th v-for="field in FIELDS" :key="field.key" class="py-2 text-start">{{ field.column }}</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="table-row">
          <td v-for="field in FIELDS" :key="field.key" class="py-2">{{ row[field.key] }}</td>
          <td class="py-2">
            <span class="inline-flex gap-2">
              <button type="button" class="hover:underline" @click="startEdit(row)">ערוך</button>
              <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(row)">מחק</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="section-title">{{ editing ? 'עריכת שורה' : 'הוספת שורה' }}</h2>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <div v-for="field in FIELDS" :key="field.key">
        <label :for="`standing-${field.key.replaceAll('_', '-')}`" class="field-label">{{ field.label }}</label>
        <input
          :id="`standing-${field.key.replaceAll('_', '-')}`"
          v-model="form[field.key]"
          :type="field.type"
          required
          class="field-input"
        />
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
  </section>
</template>
