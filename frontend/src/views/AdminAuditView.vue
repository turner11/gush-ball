<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { fullAdmin } from '../composables/useAuth'
import { useTeams } from '../composables/useTeams'
import { apiFetch } from '../lib/api'
import { formatDateTime, formatIsraelDay } from '../lib/format'

const TYPE_LABELS = {
  game: 'משחק',
  player: 'שחקן',
  player_image: 'תמונת שחקן',
  player_video: 'סרטון שחקן',
  link: 'קישור',
  video: 'וידאו',
  image: 'תמונה',
  post: 'פוסט',
  play: 'מהלך',
  standing: 'טבלה',
  team: 'קבוצה',
  membership: 'חברות',
}
const ACTION_LABELS = { create: 'נוצר', update: 'עודכן', delete: 'נמחק' }
const GROUP_LABELS = { user: 'מי', date: 'תאריך', field: 'שדה', team: 'קבוצה', action: 'סוג שינוי' }
const PAGE_SIZE = 200 // matches the backend default limit

const route = useRoute()
const router = useRouter()
const group = computed({
  get: () => (route.query.group in GROUP_LABELS ? route.query.group : ''),
  set: (v) => router.replace({ query: { ...route.query, group: v || undefined } }),
})

const teams = ref([])
const rows = ref([])
const teamId = ref('')
const entityType = ref('')
const entity = ref(null) // { type, id } set by clicking a row's entity
const loading = ref(true)
const error = ref(null)
const hasMore = ref(false)
const loadingMore = ref(false)
const moreError = ref(null)
let generation = 0 // bumped by load() so a slow loadMore() from an old filter is dropped

const teamNames = computed(() => Object.fromEntries(teams.value.map((t) => [t.id, t.name])))
const hasFilters = computed(() => Boolean(teamId.value || entityType.value || entity.value))
const entityLabel = (type, id) => `${TYPE_LABELS[type] ?? type} #${id}`
const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const actorLabel = (row) =>
  row.username === null ? 'סקרייפר' : row.user_id === null ? `${row.username} (משתמש שנמחק)` : row.username
const teamLabel = (row) =>
  row.team_id === null ? 'ללא קבוצה' : (teamNames.value[row.team_id] ?? `קבוצה #${row.team_id}`)

function groupKeys(row) {
  switch (group.value) {
    case 'user': return [actorLabel(row)]
    case 'date': return [formatIsraelDay(row.created_at)]
    case 'field': return Object.keys(row.changes).length ? Object.keys(row.changes) : ['—']
    case 'team': return [teamLabel(row)]
    default: return [ACTION_LABELS[row.action]]
  }
}

// ponytail: client-side grouping over loaded pages. Move to server-side GROUP BY if the journal grows past a few thousand rows a month.
const groups = computed(() => {
  if (!group.value) return [{ key: '', label: null, rows: rows.value }]
  const byLabel = new Map() // rows are newest-first, so Map order is newest-group-first
  for (const row of rows.value) {
    for (const label of groupKeys(row)) byLabel.set(label, [...(byLabel.get(label) ?? []), row])
  }
  return [...byLabel].map(([label, groupRows]) => ({ key: label, label, rows: groupRows }))
})

function filterParams() {
  const params = new URLSearchParams()
  if (teamId.value) params.set('team_id', teamId.value)
  if (entity.value) {
    params.set('entity_type', entity.value.type)
    params.set('entity_id', entity.value.id)
  } else if (entityType.value) {
    params.set('entity_type', entityType.value)
  }
  return params
}

const auditUrl = (params) => `/audit-log${params.size ? `?${params}` : ''}`

async function load() {
  generation++
  loading.value = true
  error.value = null
  moreError.value = null
  try {
    const page = await apiFetch(auditUrl(filterParams()))
    rows.value = page
    hasMore.value = page.length === PAGE_SIZE
  } catch (err) {
    error.value = err.message
  }
  loading.value = false
}

async function loadMore() {
  const started = generation
  loadingMore.value = true
  moreError.value = null
  const params = filterParams()
  params.set('before_id', rows.value.at(-1).id)
  try {
    const page = await apiFetch(auditUrl(params))
    if (started !== generation) return
    rows.value = [...rows.value, ...page]
    hasMore.value = page.length === PAGE_SIZE
  } catch (err) {
    if (started === generation) moreError.value = err.message
  } finally {
    loadingMore.value = false
  }
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
      <p v-if="rows.length" class="text-sm text-muted" aria-live="polite">מציג {{ rows.length }} שינויים אחרונים</p>
    </div>

    <p v-if="!fullAdmin" class="empty-state">פעולה זו זמינה למנהל ראשי בלבד</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
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
        <div>
          <label for="audit-group" class="field-label">קיבוץ לפי</label>
          <select id="audit-group" v-model="group" class="field-input">
            <option value="">ללא קיבוץ</option>
            <option v-for="(label, key) in GROUP_LABELS" :key="key" :value="key">{{ label }}</option>
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
      <div v-else-if="rows.length" class="space-y-3">
        <component :is="g.label === null ? 'div' : 'details'" v-for="g in groups" :key="g.key" class="card p-0">
          <summary v-if="g.label !== null" class="flex min-h-11 cursor-pointer items-center gap-2 px-4 font-bold">
            <bdi>{{ g.label }}</bdi>
            <span class="badge-muted ms-auto" :aria-label="`${g.rows.length} שינויים`">{{ g.rows.length }}</span>
          </summary>
          <ul :class="['divide-y divide-line', g.label !== null && 'border-t border-line']">
            <li v-for="row in g.rows" :key="row.id" class="space-y-1 px-4 py-3">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span :class="row.username === null ? 'text-muted' : 'font-semibold'">{{ actorLabel(row) }}</span>
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
        </component>
        <div v-if="hasMore && !loading" class="flex flex-col items-center gap-2">
          <p v-if="moreError" class="error-text" role="alert">{{ moreError }}</p>
          <button
            type="button"
            class="btn-secondary w-full sm:w-auto"
            data-testid="load-more"
            :disabled="loadingMore"
            :aria-busy="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? 'טוען…' : 'טען עוד' }}
          </button>
        </div>
      </div>
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
