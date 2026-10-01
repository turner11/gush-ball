<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import { useAuth } from '../composables/useAuth'
import { apiFetch } from '../lib/api'
import { teamRows } from '../lib/standings'

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

// Every row in the table shares the selected league, so the table skips that column.
const TABLE_FIELDS = FIELDS.filter((f) => f.key !== 'league_name')

function emptyForm(league = '') {
  return { ...Object.fromEntries(FIELDS.map((f) => [f.key, ''])), league_name: league }
}

// Team admins get a read-only view of their own team's league(s); the server keeps writes full-admin.
const { user } = useAuth()
const readOnly = computed(() => !!user.value?.team_id)

const rows = ref([])
const team = ref(null)
const loading = ref(true)
const loadError = ref(null)
const selectedLeague = ref('')
const editing = ref(null)
const form = ref(emptyForm())
watch(selectedLeague, (league) => {
  if (!editing.value) form.value.league_name = league
})
const error = ref(null)

const leagues = computed(() => {
  const visible = readOnly.value ? teamRows(rows.value, team.value) : rows.value
  return [...new Set(visible.map((r) => r.league_name))]
})
const leagueRows = computed(() => rows.value.filter((r) => r.league_name === selectedLeague.value))

// Pick the first league on load, and recover when the selected league's last row is deleted.
watch(
  leagues,
  (ls) => {
    if (!ls.includes(selectedLeague.value)) selectedLeague.value = ls[0] ?? ''
  },
  { immediate: true },
)

async function loadRows() {
  try {
    ;[rows.value, team.value] = await Promise.all([
      apiFetch('/standings'),
      readOnly.value ? apiFetch(`/teams/${user.value.team_id}`) : null,
    ])
  } catch {
    loadError.value = 'שגיאה בטעינת הטבלה, נסה שוב'
  } finally {
    loading.value = false
  }
}

onMounted(loadRows)

function resetForm() {
  editing.value = null
  form.value = emptyForm(selectedLeague.value)
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

    selectedLeague.value = payload.league_name
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
    <div class="page-header">
      <h1 class="page-title">ניהול טבלת ליגה</h1>
      <div v-if="leagues.length" class="w-full sm:w-64">
        <label for="league-select" class="field-label">ליגה</label>
        <select id="league-select" v-model="selectedLeague" class="field-input">
          <option v-for="league in leagues" :key="league" :value="league">{{ league }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-10 w-64" />
      <div class="skeleton h-64" />
    </div>
    <p v-else-if="loadError" class="error-text" role="alert">{{ loadError }}</p>

    <div v-else :class="['grid gap-6 lg:items-start', { 'lg:grid-cols-[minmax(0,1fr)_22rem]': !readOnly }]">
      <div class="min-w-0">
        <div v-if="leagueRows.length" class="table-wrap">
          <table class="data-table">
            <thead>
              <tr class="table-header-row">
                <th v-for="field in TABLE_FIELDS" :key="field.key">{{ field.column }}</th>
                <th v-if="!readOnly"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in leagueRows" :key="row.id" class="table-body-row">
                <td v-for="field in TABLE_FIELDS" :key="field.key" :data-label="field.column">{{ row[field.key] }}</td>
                <td v-if="!readOnly" class="justify-end">
                  <span class="inline-flex gap-1">
                    <button type="button" class="btn-ghost" @click="startEdit(row)">ערוך</button>
                    <button type="button" class="btn-danger-ghost" @click="onDelete(row)">מחק</button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="readOnly" class="empty-state">
          לא נמצאה טבלת ליגה עבור הקבוצה. הריצו סנכרון טבלת ליגה בעמוד הראשי.
          <RouterLink :to="{ name: 'admin-home' }" class="section-link">לסנכרון</RouterLink>
        </p>
        <p v-else class="empty-state">אין שורות טבלה עדיין. הוסיפו שורה או הריצו סנכרון בעמוד הראשי.</p>
      </div>

      <form v-if="!readOnly" id="standing-form" ref="formEl" class="card scroll-mt-24 space-y-3 lg:sticky lg:top-20" @submit.prevent="onSubmit">
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
    <a v-if="!readOnly" href="#standing-form" class="fab lg:hidden" aria-label="הוספת שורה"><AppIcon name="plus" /></a>
  </section>
</template>
