<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'

const FIELDS = [
  'league_name',
  'team_name',
  'rank',
  'played',
  'won',
  'lost',
  'points_for',
  'points_against',
  'points',
]

function emptyForm() {
  return { league_name: '', team_name: '', rank: '', played: '', won: '', lost: '', points_for: '', points_against: '', points: '' }
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
  const payload = { league_name: form.value.league_name, team_name: form.value.team_name }
  for (const field of FIELDS.slice(2)) {
    payload[field] = form.value[field] === '' ? 0 : Number(form.value[field])
  }
  return payload
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
          <th class="py-2 text-start">ליגה</th>
          <th class="py-2 text-start">קבוצה</th>
          <th class="py-2 text-start">דירוג</th>
          <th class="py-2 text-start">משחקים</th>
          <th class="py-2 text-start">נצחונות</th>
          <th class="py-2 text-start">הפסדים</th>
          <th class="py-2 text-start">נק' זכות</th>
          <th class="py-2 text-start">נק' חובה</th>
          <th class="py-2 text-start">נקודות</th>
          <th class="py-2 text-start"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="table-row">
          <td class="py-2">{{ row.league_name }}</td>
          <td class="py-2">{{ row.team_name }}</td>
          <td class="py-2">{{ row.rank }}</td>
          <td class="py-2">{{ row.played }}</td>
          <td class="py-2">{{ row.won }}</td>
          <td class="py-2">{{ row.lost }}</td>
          <td class="py-2">{{ row.points_for }}</td>
          <td class="py-2">{{ row.points_against }}</td>
          <td class="py-2">{{ row.points }}</td>
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

      <div>
        <label for="standing-league-name" class="field-label">ליגה</label>
        <input id="standing-league-name" v-model="form.league_name" type="text" required class="field-input" />
      </div>

      <div>
        <label for="standing-team-name" class="field-label">קבוצה</label>
        <input id="standing-team-name" v-model="form.team_name" type="text" required class="field-input" />
      </div>

      <div>
        <label for="standing-rank" class="field-label">דירוג</label>
        <input id="standing-rank" v-model="form.rank" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-played" class="field-label">משחקים</label>
        <input id="standing-played" v-model="form.played" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-won" class="field-label">נצחונות</label>
        <input id="standing-won" v-model="form.won" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-lost" class="field-label">הפסדים</label>
        <input id="standing-lost" v-model="form.lost" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-points-for" class="field-label">נקודות זכות</label>
        <input id="standing-points-for" v-model="form.points_for" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-points-against" class="field-label">נקודות חובה</label>
        <input id="standing-points-against" v-model="form.points_against" type="number" required class="field-input" />
      </div>

      <div>
        <label for="standing-points" class="field-label">נקודות</label>
        <input id="standing-points" v-model="form.points" type="number" required class="field-input" />
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
