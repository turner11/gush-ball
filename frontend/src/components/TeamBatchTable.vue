<script>
export const SOCIALS = [
  { key: 'facebook_url', label: 'פייסבוק' },
  { key: 'instagram_url', label: 'אינסטגרם' },
  { key: 'youtube_url', label: 'יוטיוב' },
  { key: 'tiktok_url', label: 'טיקטוק' },
  { key: 'twitter_url', label: 'טוויטר (X)' },
]
// The team fields a row edits; batch edit diffs exactly these.
export const EDITABLE_KEYS = [
  'name',
  'name_en',
  'home_court_address',
  'primary_color',
  'secondary_color',
  'background',
  ...SOCIALS.map((s) => s.key),
]
</script>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { apiFetch } from '../lib/api'

// Editable review table shared by the club import (create) and batch edit (update).
// `save(row)` creates or updates the team and resolves to its id; it throws on failure.
const props = defineProps({
  submitLabel: { type: String, required: true },
  save: { type: Function, required: true },
})
const rows = defineModel('rows', { type: Array, required: true })

const router = useRouter()
const admins = ref([])
const adminsState = ref('loading') // 'loading' | 'ready' | 'failed'
const saving = ref(false)
const progress = ref(0)
const batchSize = ref(0)
const summary = ref(null)
const duplicateAdmin = ref(false)

const key = (row) => row.id ?? row.ibasketball_team_url
const socialCount = (row) => SOCIALS.filter((s) => row[s.key]).length
const currentAdmins = (row) => admins.value.filter((a) => a.team_id === row.id).map((a) => a.username).join('، ')
const total = computed(() => rows.value.length)

onMounted(async () => {
  try {
    admins.value = await apiFetch('/teams/admins')
    adminsState.value = 'ready'
  } catch {
    adminsState.value = 'failed'
  }
})

async function saveRow(row) {
  row.error = null
  try {
    row.id = await props.save(row)
  } catch {
    row.error = 'שגיאה בשמירת הקבוצה — בדקו את הקישורים'
    return false
  }
  try {
    if (row.admin_id) await apiFetch(`/teams/${row.id}/admins/${row.admin_id}`, { method: 'PUT' })
  } catch {
    row.error = 'הקבוצה נשמרה, שיוך המנהל נכשל — נסו שוב'
    return false
  }
  return true
}

async function onSubmit() {
  const picked = rows.value.map((r) => r.admin_id).filter(Boolean)
  duplicateAdmin.value = new Set(picked).size < picked.length
  if (duplicateAdmin.value) return
  saving.value = true
  progress.value = 0
  batchSize.value = total.value
  let saved = 0
  let failed = 0
  for (const row of [...rows.value]) {
    progress.value += 1
    if (await saveRow(row)) {
      rows.value = rows.value.filter((r) => r !== row)
      saved += 1
    } else failed += 1
  }
  saving.value = false
  if (!failed) return router.push({ name: 'admin-teams' })
  summary.value = `נשמרו ${saved}, נכשלו ${failed}`
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <p class="text-sm text-muted">שיוך מנהל מעביר אותו מהקבוצה הנוכחית שלו</p>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr class="table-header-row">
            <th>לוגו</th>
            <th>שם</th>
            <th>שם באנגלית</th>
            <th>ליגה</th>
            <th>כתובת</th>
            <th>צבעים</th>
            <th>רקע</th>
            <th>רשתות חברתיות</th>
            <th>מנהל</th>
            <th><span class="sr-only">הסרה</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="key(row)" class="table-body-row">
            <td data-label="לוגו" :class="{ 'max-sm:hidden': !row.logo_url }">
              <img v-if="row.logo_url" :src="row.logo_url" alt="" class="size-10 object-contain" />
            </td>
            <td data-label="שם">
              <input v-model="row.name" type="text" required class="field-input mt-0 w-full min-w-0 sm:min-w-48 font-bold" :aria-label="`שם — ${row.initialName}`" />
              <a
                v-if="row.ibasketball_team_url"
                :href="row.ibasketball_team_url"
                target="_blank"
                rel="noopener"
                class="inline-flex min-h-11 items-center text-sm underline"
                :aria-label="`דף הקבוצה ב-ibasketball — ${row.initialName}`"
              >דף הקבוצה ב-ibasketball</a>
            </td>
            <td data-label="שם באנגלית">
              <input v-model="row.name_en" type="text" dir="ltr" class="field-input mt-0 w-full min-w-0 sm:min-w-48" :aria-label="`שם באנגלית — ${row.initialName}`" />
            </td>
            <td data-label="ליגה">
              <a v-if="row.ibasketball_league_url" :href="row.ibasketball_league_url" target="_blank" rel="noopener" class="underline">{{ row.league_name || 'דף הליגה' }}</a>
              <span v-else-if="row.league_name" class="badge-muted">{{ row.league_name }} · לא זוהתה</span>
              <span v-else class="text-muted">—</span>
            </td>
            <td data-label="כתובת">
              <input v-model="row.home_court_address" type="text" maxlength="300" class="field-input mt-0 w-full min-w-0 sm:min-w-48" :aria-label="`כתובת — ${row.initialName}`" />
            </td>
            <td data-label="צבעים">
              <span class="flex items-center gap-2">
                <input v-model="row.primary_color" type="color" class="h-11 w-16 rounded" :aria-label="`צבע ראשי — ${row.initialName}`" />
                <input v-model="row.secondary_color" type="color" class="h-11 w-16 rounded" :aria-label="`צבע משני — ${row.initialName}`" />
              </span>
            </td>
            <td data-label="רקע">
              <select v-model="row.background" class="field-input mt-0 w-full min-w-0 sm:min-w-28" :aria-label="`רקע — ${row.initialName}`">
                <option value="hoop-1">רקע 1</option>
                <option value="hoop-2">רקע 2</option>
              </select>
            </td>
            <td data-label="רשתות חברתיות">
              <details class="w-full min-w-0">
                <summary class="flex min-h-11 cursor-pointer items-center">רשתות ({{ socialCount(row) }})</summary>
                <div class="space-y-2 pb-2">
                  <div v-for="social in SOCIALS" :key="social.key">
                    <label :for="`batch-${key(row)}-${social.key}`" class="field-label">{{ social.label }}</label>
                    <input :id="`batch-${key(row)}-${social.key}`" v-model="row[social.key]" type="url" dir="ltr" class="field-input mt-0 w-full min-w-0" />
                  </div>
                </div>
              </details>
            </td>
            <td data-label="מנהל">
              <span v-if="adminsState === 'failed'" class="text-sm text-muted">לא ניתן לטעון מנהלים</span>
              <template v-else>
                <select v-model="row.admin_id" :disabled="adminsState === 'loading'" class="field-input mt-0 w-full min-w-0 sm:min-w-40" :aria-label="`מנהל — ${row.initialName}`">
                  <option value="">ללא שינוי</option>
                  <option v-for="a in admins" :key="a.id" :value="a.id">{{ a.username }} — {{ a.team_name }}</option>
                </select>
                <p v-if="currentAdmins(row)" class="text-sm text-muted">מנהלים נוכחיים: {{ currentAdmins(row) }}</p>
              </template>
            </td>
            <td>
              <button type="button" class="btn-danger-ghost" :aria-label="`הסרה מהרשימה — ${row.initialName}`" @click="rows = rows.filter((r) => r !== row)">הסרה מהרשימה</button>
              <p v-if="row.error" class="error-text" role="alert">{{ row.error }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="duplicateAdmin" class="error-text" role="alert">אותו מנהל נבחר ליותר מקבוצה אחת</p>
    <p v-if="summary" class="error-text" role="alert">{{ summary }}</p>
    <p v-if="saving" role="status" aria-live="polite" class="text-sm text-muted">שומרים {{ progress }}/{{ batchSize }}…</p>

    <div class="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
      <button type="submit" :disabled="saving" class="btn-primary w-full sm:w-auto">{{ submitLabel }}</button>
    </div>
  </form>
</template>
