<script setup>
import { onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'

const inputClass =
  'mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800'

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

  if (editing.value) {
    const updated = await apiFetch(`/standings/${editing.value.id}`, { method: 'PATCH', body: payload })
    const idx = rows.value.findIndex((r) => r.id === updated.id)
    if (idx !== -1) rows.value[idx] = updated
  } else {
    const created = await apiFetch('/standings', { method: 'POST', body: payload })
    rows.value.push(created)
  }

  resetForm()
}

async function onDelete(row) {
  await apiFetch(`/standings/${row.id}`, { method: 'DELETE' })
  rows.value = rows.value.filter((r) => r.id !== row.id)
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-bold">ניהול טבלת ליגה</h1>

    <table class="w-full text-start">
      <thead>
        <tr class="border-b border-neutral-200 text-sm dark:border-neutral-700">
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
        <tr v-for="row in rows" :key="row.id" class="border-b border-neutral-100 dark:border-neutral-800">
          <td class="py-2">{{ row.league_name }}</td>
          <td class="py-2">{{ row.team_name }}</td>
          <td class="py-2">{{ row.rank }}</td>
          <td class="py-2">{{ row.played }}</td>
          <td class="py-2">{{ row.won }}</td>
          <td class="py-2">{{ row.lost }}</td>
          <td class="py-2">{{ row.points_for }}</td>
          <td class="py-2">{{ row.points_against }}</td>
          <td class="py-2">{{ row.points }}</td>
          <td class="py-2 space-x-2 space-x-reverse">
            <button type="button" class="hover:underline" @click="startEdit(row)">ערוך</button>
            <button type="button" class="text-red-600 hover:underline dark:text-red-400" @click="onDelete(row)">מחק</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="max-w-sm space-y-3" @submit.prevent="onSubmit">
      <h2 class="font-semibold">{{ editing ? 'עריכת שורה' : 'הוספת שורה' }}</h2>

      <div>
        <label for="standing-league-name" class="block text-sm font-medium">ליגה</label>
        <input id="standing-league-name" v-model="form.league_name" type="text" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-team-name" class="block text-sm font-medium">קבוצה</label>
        <input id="standing-team-name" v-model="form.team_name" type="text" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-rank" class="block text-sm font-medium">דירוג</label>
        <input id="standing-rank" v-model="form.rank" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-played" class="block text-sm font-medium">משחקים</label>
        <input id="standing-played" v-model="form.played" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-won" class="block text-sm font-medium">נצחונות</label>
        <input id="standing-won" v-model="form.won" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-lost" class="block text-sm font-medium">הפסדים</label>
        <input id="standing-lost" v-model="form.lost" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-points-for" class="block text-sm font-medium">נקודות זכות</label>
        <input id="standing-points-for" v-model="form.points_for" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-points-against" class="block text-sm font-medium">נקודות חובה</label>
        <input id="standing-points-against" v-model="form.points_against" type="number" required :class="inputClass" />
      </div>

      <div>
        <label for="standing-points" class="block text-sm font-medium">נקודות</label>
        <input id="standing-points" v-model="form.points" type="number" required :class="inputClass" />
      </div>

      <div class="flex gap-2">
        <button type="submit" class="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-neutral-100 dark:text-neutral-900">
          {{ editing ? 'שמירה' : 'הוספה' }}
        </button>
        <button v-if="editing" type="button" class="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600" @click="resetForm">
          ביטול
        </button>
      </div>
    </form>
  </section>
</template>
