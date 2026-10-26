<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'
import { STATUS_LABELS } from '../lib/games'

// Add (game = null) or edit one game. Filled once at setup: the parent remounts it (:key) to refill or clear.
const props = defineProps({
  teamId: { type: [String, Number], required: true },
  game: { type: Object, default: null },
  statsUrl: { type: String, default: null },
})
const emit = defineEmits(['saved', 'cancel'])

const STATUSES = Object.keys(STATUS_LABELS)

const g = props.game
const form = ref({
  opponent_name: g?.opponent.name ?? '',
  scheduled_at: g?.scheduled_at.slice(0, 16) ?? '',
  is_home: g?.is_home ?? true,
  status: g?.status ?? 'scheduled',
  team_score: g?.team_score ?? '',
  opponent_score: g?.opponent_score ?? '',
  description: g?.description ?? '',
})
const saving = ref(false)
const error = ref(null)

async function save() {
  const payload = {
    opponent_name: form.value.opponent_name,
    scheduled_at: form.value.scheduled_at,
    is_home: form.value.is_home,
    status: form.value.status,
    team_score: form.value.team_score === '' ? null : Number(form.value.team_score),
    opponent_score: form.value.opponent_score === '' ? null : Number(form.value.opponent_score),
    description: form.value.description || null,
  }
  saving.value = true
  error.value = null
  try {
    let saved
    if (props.game) {
      // Omitted unless the caller owns the sheet link: update_game ignores unset keys, so the saved sheet stays.
      if (props.statsUrl !== null) payload.stats_url = props.statsUrl.trim() || null
      saved = await apiFetch(`/teams/${props.teamId}/games/${props.game.id}`, { method: 'PATCH', body: payload })
    } else {
      saved = await apiFetch(`/teams/${props.teamId}/games`, { method: 'POST', body: payload })
    }
    emit('saved', saved)
  } catch {
    error.value = 'שגיאה בשמירת המשחק, נסה שוב'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="save">
    <h2 class="section-title">{{ game ? 'עריכת משחק' : 'הוספת משחק' }}</h2>

    <div>
      <label for="game-opponent-name" class="field-label">יריבה</label>
      <input id="game-opponent-name" v-model="form.opponent_name" type="text" required class="field-input" />
    </div>

    <div>
      <label for="game-scheduled-at" class="field-label">תאריך ושעה</label>
      <input id="game-scheduled-at" v-model="form.scheduled_at" type="datetime-local" required class="field-input" />
    </div>

    <label class="flex min-h-11 items-center gap-2">
      <input v-model="form.is_home" type="checkbox" class="size-5" />
      <span class="field-label">משחק בית</span>
    </label>

    <div>
      <label for="game-status" class="field-label">סטטוס</label>
      <select id="game-status" v-model="form.status" class="field-input">
        <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABELS[s] }}</option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div>
        <label for="game-team-score" class="field-label">תוצאה — קבוצה</label>
        <input id="game-team-score" v-model="form.team_score" type="number" class="field-input" />
      </div>
      <div>
        <label for="game-opponent-score" class="field-label">תוצאה — יריבה</label>
        <input id="game-opponent-score" v-model="form.opponent_score" type="number" class="field-input" />
      </div>
    </div>

    <div>
      <label for="game-description" class="field-label">תיאור</label>
      <textarea id="game-description" v-model="form.description" maxlength="2000" class="field-input"></textarea>
    </div>

    <slot />

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <div class="flex gap-2">
      <button type="submit" class="btn-primary" :disabled="saving">{{ game ? 'שמירה' : 'הוספה' }}</button>
      <button type="button" class="btn-secondary" @click="emit('cancel')">ביטול</button>
    </div>
  </form>
</template>
