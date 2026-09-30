<script setup>
import { computed, onMounted, ref } from 'vue'

import { apiFetch } from '../lib/api'

const props = defineProps({
  teamId: { type: [String, Number], required: true },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const players = ref([])
const text = ref('')
const listId = `player-tags-${Math.random().toString(36).slice(2)}`

const available = computed(() => players.value.filter((p) => !props.modelValue.includes(p.id)))

// Ids of soft-deleted players stay in the array (so saving doesn't drop the tag); the name is unknown.
function label(id) {
  return players.value.find((p) => p.id === id)?.name ?? `#${id}`
}

function add() {
  const player = available.value.find((p) => p.name === text.value)
  if (!player) return
  emit('update:modelValue', [...props.modelValue, player.id])
  text.value = ''
}

function remove(id) {
  emit('update:modelValue', props.modelValue.filter((x) => x !== id))
}

onMounted(async () => {
  players.value = (await apiFetch(`/teams/${props.teamId}/players`)) ?? []
})
</script>

<template>
  <div class="space-y-2">
    <label :for="listId" class="field-label">תיוג שחקנים</label>
    <ul v-if="modelValue.length" class="flex flex-wrap gap-1">
      <li v-for="id in modelValue" :key="id" class="inline-flex items-center gap-1">
        <span>{{ label(id) }}</span>
        <button type="button" class="btn-ghost" :aria-label="`הסרת ${label(id)}`" @click="remove(id)">
          ×
        </button>
      </li>
    </ul>
    <input :id="listId" v-model="text" :list="`${listId}-options`" class="field-input" @change="add" />
    <datalist :id="`${listId}-options`">
      <option v-for="p in available" :key="p.id" :value="p.name">{{ p.jersey_number ?? '' }}</option>
    </datalist>
  </div>
</template>
