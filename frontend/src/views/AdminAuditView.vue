<script setup>
import { computed, onMounted, ref } from 'vue'

import { fullAdmin } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'

const TYPE_LABELS = {
  game: 'משחק',
  player: 'שחקן',
  player_image: 'תמונת שחקן',
  player_video: 'סרטון שחקן',
  link: 'קישור',
  video: 'וידאו',
  image: 'תמונה',
  post: 'פוסט',
  standing: 'טבלה',
  team: 'קבוצה',
  membership: 'חברות',
}
const ACTION_LABELS = { create: 'נוצר', update: 'עודכן', delete: 'נמחק' }

const teams = ref([])
const rows = ref([])
const teamId = ref('')
const entityType = ref('')
const entity = ref(null) // { type, id } set by clicking a row's entity
const loading = ref(true)
const error = ref(null)

const teamNames = computed(() => Object.fromEntries(teams.value.map((t) => [t.id, t.name])))
const hasFilters = computed(() => Boolean(teamId.value || entityType.value || entity.value))
const entityLabel = (type, id) => `${TYPE_LABELS[type] ?? type} #${id}`
const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))

async function load() {
  loading.value = true
  error.value = null
  const params = new URLSearchParams()
  if (teamId.value) params.set('team_id', teamId.value)
  if (entity.value) {
    params.set('entity_type', entity.value.type)
    params.set('entity_id', entity.value.id)
  } else if (entityType.value) {
    params.set('entity_type', entityType.value)
  }
  const query = params.toString()
  try {
    rows.value = await apiFetch(`/audit-log${query ? `?${query}` : ''}`)
  } catch (err) {
    error.value = err.message
  }
  loading.value = false
}

function filterEntity(row) {
  entity.value = { type: row.entity_type, id: row.entity_id }
  entityType.value = row.entity_type
  load()
}

function clearEntity() {
  entity.value = null
  entityType.value = ''
  load()
}

function clearFilters() {
  teamId.value = ''
  entityType.value = ''
  entity.value = null
  load()
}

function onTypeChange() {
  entity.value = null
  load()
}

onMounted(async () => {
  if (!fullAdmin.value) return
  teams.value = (await useTeams().list()) ?? []
  load()
})
</script>

<template>
  <section class="space-y-6">
    <div class="page-header">
      <h1 class="page-title">יומן שינויים</h1>
      <p class="text-sm text-muted">200 השינויים האחרונים</p>
    </div>

    <p v-if="!fullAdmin" class="empty-state">פעולה זו זמינה למנהל ראשי בלבד</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label for="audit-team" class="field-label">קבוצה</label>
          <select id="audit-team" v-model="teamId" class="field-input" @change="load">
            <option value="">כל הקבוצות</option>
            <option v-for="t in teams" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
          </select>
        </div>
        <div>
          <label for="audit-type" class="field-label">סוג</label>
          <select id="audit-type" v-model="entityType" class="field-input" @change="onTypeChange">
            <option value="">הכול</option>
            <option v-for="(label, type) in TYPE_LABELS" :key="type" :value="type">{{ label }}</option>
          </select>
        </div>
      </div>
      <button
        v-if="entity"
        type="button"
        class="btn-ghost min-h-11"
        data-testid="entity-chip"
        :aria-label="`הסרת סינון ${entityLabel(entity.type, entity.id)}`"
        @click="clearEntity"
      >
        {{ entityLabel(entity.type, entity.id) }} ✕
      </button>

      <div v-if="error" class="card flex flex-wrap items-center gap-3" data-testid="list-error">
        <p class="error-text" role="alert">{{ error }}</p>
        <button type="button" class="btn-secondary ms-auto" @click="load">נסו שוב</button>
      </div>
      <ul v-else-if="rows.length" class="card divide-y divide-line p-0">
        <li v-for="row in rows" :key="row.id" class="space-y-1 px-4 py-3">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span v-if="row.username === null" class="text-muted">סקרייפר</span>
            <span v-else-if="row.user_id === null" class="font-semibold">{{ row.username }} (משתמש שנמחק)</span>
            <span v-else class="font-semibold">{{ row.username }}</span>
            <span class="badge-muted">{{ ACTION_LABELS[row.action] }}</span>
            <button
              type="button"
              class="min-h-11 font-semibold underline-offset-2 hover:underline"
              :aria-label="`סינון לפי ${entityLabel(row.entity_type, row.entity_id)}`"
              @click="filterEntity(row)"
            >
              {{ entityLabel(row.entity_type, row.entity_id) }}
            </button>
            <span v-if="teamNames[row.team_id]" class="text-sm text-muted">{{ teamNames[row.team_id] }}</span>
            <time class="ms-auto text-sm text-muted" :datetime="row.created_at">{{ formatDateTime(row.created_at) }}</time>
          </div>
          <ul class="space-y-0.5 text-sm">
            <li v-for="(pair, field) in row.changes" :key="field" class="break-words">
              <code>{{ field }}</code>:
              <bdi>{{ show(pair[0]) }}</bdi> → <bdi>{{ show(pair[1]) }}</bdi>
            </li>
          </ul>
        </li>
      </ul>
      <div v-else-if="loading" class="space-y-2" aria-hidden="true">
        <div v-for="n in 3" :key="n" class="skeleton h-14" />
      </div>
      <div v-else class="empty-state">
        <p>אין שינויים להצגה</p>
        <button v-if="hasFilters" type="button" class="btn-secondary mt-3" @click="clearFilters">נקה סינון</button>
      </div>
    </template>
  </section>
</template>
