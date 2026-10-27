<script setup>
import { nextTick, onMounted, reactive, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { useTeamContent } from '../composables/useTeamContent'
import AppIcon from './AppIcon.vue'
import ImageUpload from './ImageUpload.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import PlayerTagsInput from './PlayerTagsInput.vue'

const props = defineProps({
  owner: { type: String, default: 'teams' }, // 'teams' | 'clubs'
  ownerId: { type: [String, Number], required: true },
  resource: { type: String, required: true },
  heading: { type: String, required: true },
  fields: { type: Array, required: true },
  reorderable: Boolean,
})

const { error, list, create, update, delete: destroy, reorder } = useTeamContent(props.resource, props.owner)

const items = ref([])
const BLANKS = { players: () => [], checkbox: () => false, game: () => null } // null reaches PATCH and clears the link
const blank = (field) => BLANKS[field.type]?.() ?? ''
const form = reactive(Object.fromEntries(props.fields.map((f) => [f.key, blank(f)])))
const loading = ref(true)
const submitting = ref(false)
const editingId = ref(null)
const pendingDeleteId = ref(null)

async function load() {
  items.value = (await list(props.ownerId)) ?? []
  loading.value = false
}

function resetForm() {
  editingId.value = null
  for (const field of props.fields) form[field.key] = blank(field)
}

const formEl = ref(null)

async function onEdit(item) {
  editingId.value = item.id
  for (const field of props.fields) {
    form[field.key] = item[field.key] ?? blank(field)
  }
  // the form sits below the whole list: focusing its first field scrolls it into view
  await nextTick()
  formEl.value?.querySelector('.field-input')?.focus()
}

function itemLabel(item) {
  return props.fields.filter((f) => !['players', 'checkbox', 'game'].includes(f.type)).map((f) => item[f.key]).filter(Boolean).join(' — ')
}

async function onSubmit() {
  submitting.value = true
  try {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    )
    if (editingId.value) {
      const updated = await update(props.ownerId, editingId.value, payload)
      if (updated && !error.value) {
        await load() // the server order is the truth (e.g. pinned posts move up)
        resetForm()
      }
    } else {
      const created = await create(props.ownerId, payload)
      if (created && !error.value) {
        await load()
        resetForm()
      }
    }
  } finally {
    submitting.value = false
  }
}

async function move(index, delta) {
  const next = [...items.value]
  ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
  items.value = next
  await reorder(props.ownerId, next.map((item) => item.id))
  if (error.value) await load() // the server order is the truth
}

function confirmDelete(itemId) {
  pendingDeleteId.value = itemId
}

async function onDeleteConfirmed() {
  const itemId = pendingDeleteId.value
  pendingDeleteId.value = null
  await destroy(props.ownerId, itemId)
  if (error.value) return
  items.value = items.value.filter((item) => item.id !== itemId)
  if (editingId.value === itemId) resetForm()
}

const games = ref([])
const gamesFailed = ref(false)
async function loadGames() {
  try {
    games.value = (await apiFetch(`/teams/${props.ownerId}/games`)) ?? []
  } catch {
    gamesFailed.value = true // the picker keeps only "ללא משחק"
  }
}
onMounted(() => Promise.all([props.fields.some((f) => f.type === 'game') && loadGames(), load()]))
</script>

<template>
  <section class="card space-y-3">
    <div v-if="heading" class="section-header">
      <h2 class="section-title">{{ heading }}</h2>
    </div>

    <div v-if="loading" class="space-y-2" aria-hidden="true">
      <div class="skeleton h-11" />
      <div class="skeleton h-11" />
    </div>
    <ul v-else-if="items.length" class="divide-y divide-line">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="flex items-center justify-between gap-2 py-2"
      >
        <span class="flex min-w-0 items-center gap-2">
          <template v-for="f in fields" :key="f.key">
            <img v-if="f.preview && item[f.key]" :src="item[f.key]" alt="" loading="lazy" class="size-16 shrink-0 rounded-xl object-cover" />
          </template>
          <span class="min-w-0 truncate">{{ itemLabel(item) }}</span>
          <template v-for="f in fields" :key="f.key">
            <span v-if="f.type === 'checkbox' && item[f.key]" class="badge badge-muted shrink-0">{{ f.label }}</span>
          </template>
        </span>
        <span class="inline-flex shrink-0 gap-1">
          <template v-if="reorderable">
            <button type="button" class="btn-ghost" aria-label="הזזה למעלה" :disabled="index === 0 || items[index - 1].pinned !== item.pinned" @click="move(index, -1)">
              <AppIcon name="chevron" class="rotate-180" />
            </button>
            <button type="button" class="btn-ghost" aria-label="הזזה למטה" :disabled="index === items.length - 1 || items[index + 1].pinned !== item.pinned" @click="move(index, 1)">
              <AppIcon name="chevron" />
            </button>
          </template>
          <button
            type="button"
            class="btn-ghost"
            :aria-label="'עריכה: ' + itemLabel(item)"
            @click="onEdit(item)"
          >
            עריכה
          </button>
          <button
            type="button"
            class="btn-danger-ghost"
            :aria-label="'מחיקה: ' + itemLabel(item)"
            @click="confirmDelete(item.id)"
          >
            מחיקה
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="empty-state">אין פריטים עדיין.</p>

    <ConfirmDialog
      confirm-label="מחיקה"
      :open="pendingDeleteId !== null"
      message="למחוק פריט זה?"
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />

    <form ref="formEl" class="space-y-2" @submit.prevent="onSubmit">
      <p v-if="editingId" class="text-sm text-muted">עורך: {{ fields.filter((f) => !['players', 'game'].includes(f.type)).map((f) => form[f.key]).filter(Boolean)[0] }}</p>
      <div v-for="field in fields" :key="field.key">
        <PlayerTagsInput v-if="field.type === 'players'" v-model="form[field.key]" :team-id="ownerId" />
        <label v-else-if="field.type === 'checkbox'" class="flex min-h-11 items-center gap-2">
          <input v-model="form[field.key]" type="checkbox" class="size-5" />
          <span class="field-label">{{ field.label }}</span>
        </label>
        <template v-else-if="field.type === 'game'">
          <label :for="`${resource}-${field.key}`" class="field-label">{{ field.label }}</label>
          <select :id="`${resource}-${field.key}`" v-model="form[field.key]" class="field-input">
            <option :value="null">ללא משחק</option>
            <option v-for="g in games" :key="g.id" :value="g.id">{{ formatDateTime(g.scheduled_at) }} · {{ g.opponent.name }}</option>
          </select>
          <p v-if="gamesFailed" class="mt-1 text-sm text-muted">טעינת המשחקים נכשלה</p>
        </template>
        <template v-else>
        <label :for="`${resource}-${field.key}`" class="field-label">
          {{ field.label }}
        </label>
        <textarea
          v-if="field.type === 'textarea'"
          :id="`${resource}-${field.key}`"
          v-model="form[field.key]"
          :required="field.required"
          :maxlength="field.maxlength"
          class="field-input"
        />
        <input
          v-else
          :id="`${resource}-${field.key}`"
          v-model="form[field.key]"
          :type="field.type"
          :required="field.required"
          class="field-input"
        />
        <ImageUpload v-if="field.upload" :accept="field.accept" @uploaded="(url) => (form[field.key] = url)" />
        <!-- big enough to tell who is in the photo while tagging below -->
        <img v-if="field.preview && form[field.key]" :src="form[field.key]" alt="תצוגה מקדימה" class="mt-2 max-h-72 w-full rounded-xl bg-raised object-contain" />
        </template>
      </div>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>

      <div class="flex gap-2">
        <button type="submit" :disabled="submitting" class="btn-primary">
          {{ editingId ? 'עדכון' : 'הוספה' }}
        </button>
        <button v-if="editingId" type="button" class="btn-secondary" @click="resetForm">
          ביטול
        </button>
      </div>
    </form>
  </section>
</template>
