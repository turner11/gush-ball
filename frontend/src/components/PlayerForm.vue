<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'

// Add (player = null) or edit one roster entry. Filled once at setup: the parent remounts it (:key) to refill or clear.
const props = defineProps({
  teamId: { type: [String, Number], required: true },
  player: { type: Object, default: null },
  // undefined = leave the account link alone (omitted from the PATCH), null = unlink, number = link.
  userId: { default: undefined },
})
const emit = defineEmits(['saved', 'cancel'])

const p = props.player
const form = ref({
  name: p?.name ?? '',
  name_en: p?.name_en ?? '',
  jersey_number: p?.jersey_number ?? '',
  is_coach: p?.is_coach ?? false,
  birth_date: p?.birth_date ?? '',
})
const saving = ref(false)
const error = ref(null)

async function save() {
  const payload = {
    name: form.value.name,
    name_en: form.value.name_en || null,
    jersey_number: form.value.is_coach || form.value.jersey_number === '' ? null : Number(form.value.jersey_number),
    is_coach: form.value.is_coach,
    birth_date: form.value.birth_date || null,
  }
  saving.value = true
  error.value = null
  try {
    let saved
    if (props.player) {
      if (props.userId !== undefined) payload.user_id = props.userId
      saved = await apiFetch(`/teams/${props.teamId}/players/${props.player.id}`, { method: 'PATCH', body: payload })
    } else {
      saved = await apiFetch(`/teams/${props.teamId}/players`, { method: 'POST', body: payload })
    }
    emit('saved', saved)
  } catch {
    error.value = 'שגיאה בשמירת השחקן, נסו שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="save">
    <h2 class="section-title">{{ player ? 'עריכת שחקן' : 'הוספת שחקן' }}</h2>

    <div>
      <label for="player-name" class="field-label">שם</label>
      <input id="player-name" v-model="form.name" type="text" required class="field-input" />
    </div>

    <div>
      <label for="player-name-en" class="field-label">שם באנגלית</label>
      <input id="player-name-en" v-model="form.name_en" type="text" class="field-input" />
    </div>

    <label class="flex min-h-11 items-center gap-2">
      <input id="player-is-coach" v-model="form.is_coach" type="checkbox" class="size-5" />
      <span class="field-label">מאמן</span>
    </label>

    <div v-if="!form.is_coach">
      <label for="player-jersey-number" class="field-label">מספר חולצה</label>
      <input id="player-jersey-number" v-model="form.jersey_number" type="number" class="field-input" />
    </div>

    <div>
      <label for="player-birth-date" class="field-label">תאריך לידה</label>
      <input id="player-birth-date" v-model="form.birth_date" type="date" class="field-input" />
    </div>

    <slot />

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <div class="flex gap-2">
      <button type="submit" class="btn-primary" :disabled="saving">{{ player ? 'שמירה' : 'הוספה' }}</button>
      <button type="button" class="btn-secondary" @click="emit('cancel')">ביטול</button>
    </div>
  </form>
</template>
