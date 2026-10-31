<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'

import { apiFetch, apiUrl } from '../lib/api'
import AppIcon from './AppIcon.vue'
import LoadError from './LoadError.vue'

const props = defineProps({
  teamId: { type: [Number, String], required: true },
  gameId: { type: Number, required: true },
  hasStats: { type: Boolean, default: false },
})
const emit = defineEmits(['saved']) // { has_stats }: the parent applies it to its game

// Cells in the sheet's column order: players 1-5, our points, their points, quarter, time left.
const HEADS = ['1', '2', '3', '4', '5', 'נק׳ שלנו', 'נק׳ יריבה', 'רבע', 'זמן נותר']
const LABELS = ['שחקן 1', 'שחקן 2', 'שחקן 3', 'שחקן 4', 'שחקן 5', 'נקודות שלנו', 'נקודות יריבה', 'רבע', 'זמן נותר']
const TIME = 8

const root = ref(null)
const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref('')
const justSaved = ref(false)
const rows = ref([]) // { key, cells: string[9] }
const savedJson = ref('[]')
let nextKey = 0

const path = `/teams/${props.teamId}/games/${props.gameId}/stats`
const toRows = (list) => list.map((cells) => ({ key: nextKey++, cells: [...cells] }))
const json = () => JSON.stringify(rows.value.map((r) => r.cells))
const dirty = computed(() => json() !== savedJson.value)
const exportUrl = apiUrl(`${path}.csv`)

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const saved = await apiFetch(`${path}/rows`)
    rows.value = toRows(saved)
    savedJson.value = JSON.stringify(saved)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function addRow() {
  const last = rows.value.at(-1)?.cells
  // Same players, score and quarter as the row above; only the time is new. First row: blank lineup, start of Q1.
  const cells = last ? [...last.slice(0, TIME), ''] : ['', '', '', '', '', '0', '0', '1', '10:00']
  rows.value.push(...toRows([cells]))
  justSaved.value = false
  await nextTick()
  root.value.querySelector(`[data-row]:last-of-type [data-col="${TIME}"]`)?.focus()
}

async function removeRow(index) {
  rows.value.splice(index, 1)
  justSaved.value = false
  await nextTick()
  const next = root.value.querySelectorAll('[data-delete]')[index] ?? root.value.querySelector('[data-add]')
  next?.focus()
}

// Saves the table (the parent calls this when ending the edit). True = nothing to save or saved; false = rejected.
async function save() {
  if (!dirty.value) return true
  if (!root.value.querySelector('form').reportValidity()) return false
  saving.value = true
  saveError.value = ''
  justSaved.value = false
  try {
    const res = await apiFetch(`${path}/rows`, { method: 'PUT', body: rows.value.map((r) => r.cells) })
    savedJson.value = json()
    justSaved.value = true
    emit('saved', { has_stats: res.snapshots > 0 })
    return true
  } catch (e) {
    saveError.value = e.status === 422 && e.message ? e.message : 'שגיאה בשמירה, נסו שוב'
    return false
  } finally {
    saving.value = false
  }
}
defineExpose({ save })
</script>

<template>
  <div ref="root" class="space-y-3">
    <div v-if="loading" class="space-y-2" aria-busy="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-11" />
    </div>
    <LoadError v-else-if="loadError" message="שגיאה בטעינת הנתונים" @retry="load" />
    <form v-else class="space-y-3" @submit.prevent="save">
      <h3 class="font-semibold">הזנת נתונים באתר</h3>
      <p v-if="hasStats && !rows.length" class="text-sm text-muted">הנתונים הנוכחיים נטענו מגיליון; שמירה כאן תחליף אותם</p>
      <p v-if="!rows.length" class="empty-state">עדיין לא הוזנו שורות — הוסיפו שורה בכל חילוף</p>
      <div v-else>
        <div class="grid grid-cols-5 gap-2 pb-1 text-center text-xs text-muted sm:grid-cols-[repeat(9,minmax(0,1fr))_2.75rem]" aria-hidden="true">
          <span v-for="h in HEADS" :key="h">{{ h }}</span>
        </div>
        <ul class="divide-y divide-line">
          <li
            v-for="(row, i) in rows"
            :key="row.key"
            data-row
            class="grid grid-cols-5 items-center gap-2 py-2 sm:grid-cols-[repeat(9,minmax(0,1fr))_2.75rem]"
          >
            <input
              v-for="(label, c) in LABELS"
              :key="c"
              v-model="row.cells[c]"
              :data-col="c"
              :aria-label="`שורה ${i + 1}, ${label}`"
              :placeholder="c === TIME ? '10:00' : HEADS[c]"
              required
              :pattern="c === TIME ? '\\d{1,2}:\\d{2}' : '\\d*'"
              :maxlength="c === TIME ? 5 : 3"
              :dir="c === TIME ? 'ltr' : undefined"
              :inputmode="c === TIME ? 'text' : 'numeric'"
              type="text"
              class="field-input !mt-0 min-w-0 !px-1 text-center tabular-nums"
              @input="justSaved = false"
            />
            <button type="button" data-delete class="btn-ghost size-11 !p-0" :aria-label="`מחיקת שורה ${i + 1}`" @click="removeRow(i)">
              <AppIcon name="close" />
            </button>
          </li>
        </ul>
      </div>
      <button type="button" data-add class="btn-secondary" @click="addRow"><AppIcon name="plus" />הוספת שורה</button>
      <p v-if="saveError" class="error-text" role="alert">{{ saveError }}</p>
      <div class="sticky-actions flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" class="text-sm text-muted">
          <template v-if="dirty">יש שינויים שלא נשמרו</template>
          <template v-else-if="justSaved">נשמר · {{ rows.length }} רשומות</template>
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <a v-if="savedJson !== '[]' && !dirty" :href="exportUrl" download class="section-link">ייצוא CSV לגיליון</a>
          <span v-else-if="dirty" class="text-sm text-muted">שמרו כדי לייצא</span>
          <button type="submit" class="btn-primary" :disabled="saving">שמירה</button>
        </div>
      </div>
    </form>
  </div>
</template>
