<script setup>
import { onMounted, reactive, ref } from 'vue'

import { useTeamContent } from '../composables/useTeamContent'

const props = defineProps({
  teamId: { type: [String, Number], required: true },
  resource: { type: String, required: true },
  heading: { type: String, required: true },
  fields: { type: Array, required: true },
})

const { error, list, create, delete: destroy } = useTeamContent(props.resource)

const items = ref([])
const form = reactive(Object.fromEntries(props.fields.map((f) => [f.key, ''])))
const submitting = ref(false)

async function load() {
  items.value = (await list(props.teamId)) ?? []
}

async function onSubmit() {
  submitting.value = true
  try {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    )
    const created = await create(props.teamId, payload)
    if (created && !error.value) {
      items.value.push(created)
      for (const key of Object.keys(form)) form[key] = ''
    }
  } finally {
    submitting.value = false
  }
}

async function onDelete(itemId) {
  if (!confirm('למחוק פריט זה?')) return
  await destroy(props.teamId, itemId)
  items.value = items.value.filter((item) => item.id !== itemId)
}

onMounted(load)
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-lg font-bold">{{ heading }}</h2>

    <ul v-if="items.length" class="space-y-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center justify-between rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600"
      >
        <span>{{ fields.map((f) => item[f.key]).filter(Boolean).join(' — ') }}</span>
        <button
          type="button"
          class="text-sm text-red-600 dark:text-red-400"
          @click="onDelete(item.id)"
        >
          מחיקה
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-neutral-500">אין פריטים עדיין.</p>

    <form class="space-y-2" @submit.prevent="onSubmit">
      <div v-for="field in fields" :key="field.key">
        <label :for="`${resource}-${field.key}`" class="block text-sm font-medium">
          {{ field.label }}
        </label>
        <textarea
          v-if="field.type === 'textarea'"
          :id="`${resource}-${field.key}`"
          v-model="form[field.key]"
          :required="field.required"
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
        <input
          v-else
          :id="`${resource}-${field.key}`"
          v-model="form[field.key]"
          :type="field.type"
          :required="field.required"
          class="mt-1 w-full rounded border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800"
        />
      </div>

      <p v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
      >
        הוספה
      </button>
    </form>
  </section>
</template>
