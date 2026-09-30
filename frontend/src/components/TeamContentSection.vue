<script setup>
import { onMounted, reactive, ref } from 'vue'

import { useTeamContent } from '../composables/useTeamContent'
import ImageUpload from './ImageUpload.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import PlayerTagsInput from './PlayerTagsInput.vue'

const props = defineProps({
  teamId: { type: [String, Number], required: true },
  resource: { type: String, required: true },
  heading: { type: String, required: true },
  fields: { type: Array, required: true },
})

const { error, list, create, update, delete: destroy } = useTeamContent(props.resource)

const items = ref([])
const blank = (field) => (field.type === 'players' ? [] : '')
const form = reactive(Object.fromEntries(props.fields.map((f) => [f.key, blank(f)])))
const submitting = ref(false)
const editingId = ref(null)
const pendingDeleteId = ref(null)

async function load() {
  items.value = (await list(props.teamId)) ?? []
}

function resetForm() {
  editingId.value = null
  for (const field of props.fields) form[field.key] = blank(field)
}

function onEdit(item) {
  editingId.value = item.id
  for (const field of props.fields) {
    form[field.key] = item[field.key] ?? blank(field)
  }
}

async function onSubmit() {
  submitting.value = true
  try {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    )
    if (editingId.value) {
      const updated = await update(props.teamId, editingId.value, payload)
      if (updated && !error.value) {
        const index = items.value.findIndex((item) => item.id === editingId.value)
        if (index !== -1) items.value[index] = updated
        resetForm()
      }
    } else {
      const created = await create(props.teamId, payload)
      if (created && !error.value) {
        items.value.push(created)
        resetForm()
      }
    }
  } finally {
    submitting.value = false
  }
}

function confirmDelete(itemId) {
  pendingDeleteId.value = itemId
}

async function onDeleteConfirmed() {
  const itemId = pendingDeleteId.value
  pendingDeleteId.value = null
  await destroy(props.teamId, itemId)
  items.value = items.value.filter((item) => item.id !== itemId)
  if (editingId.value === itemId) resetForm()
}

onMounted(load)
</script>

<template>
  <section class="card space-y-3">
    <h2 class="section-title">{{ heading }}</h2>

    <ul v-if="items.length" class="divide-y divide-line">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center justify-between gap-2 py-2"
      >
        <span class="min-w-0 truncate">{{ fields.filter((f) => f.type !== 'players').map((f) => item[f.key]).filter(Boolean).join(' — ') }}</span>
        <span class="inline-flex shrink-0 gap-1">
          <button
            type="button"
            class="btn-ghost"
            @click="onEdit(item)"
          >
            עריכה
          </button>
          <button
            type="button"
            class="btn-danger-ghost"
            @click="confirmDelete(item.id)"
          >
            מחיקה
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="empty-state">אין פריטים עדיין.</p>

    <ConfirmDialog
      :open="pendingDeleteId !== null"
      message="למחוק פריט זה?"
      @update:open="(value) => !value && (pendingDeleteId = null)"
      @confirm="onDeleteConfirmed"
    />

    <form class="space-y-2" @submit.prevent="onSubmit">
      <p v-if="editingId" class="text-sm text-muted">עורך: {{ fields.filter((f) => f.type !== 'players').map((f) => form[f.key]).filter(Boolean)[0] }}</p>
      <div v-for="field in fields" :key="field.key">
        <PlayerTagsInput v-if="field.type === 'players'" v-model="form[field.key]" :team-id="teamId" />
        <template v-else>
        <label :for="`${resource}-${field.key}`" class="field-label">
          {{ field.label }}
        </label>
        <textarea
          v-if="field.type === 'textarea'"
          :id="`${resource}-${field.key}`"
          v-model="form[field.key]"
          :required="field.required"
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
        <ImageUpload v-if="field.upload" @uploaded="(url) => (form[field.key] = url)" />
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
