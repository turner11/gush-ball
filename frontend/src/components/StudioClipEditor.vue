<script setup>
import { useTemplateRef } from 'vue'

import { needsGame, nudge } from '../lib/clips'
import { formatTimestamp } from '../lib/youtube'

// The selected clip's controls (#682). Pure: it emits what the user changed, the studio saves it.
const props = defineProps({
  clip: { type: Object, required: true },
  roster: { type: Array, required: true }, // the team's players, coaches excluded
  sections: { type: Array, required: true }, // section names used in the team's other clips
  jerseyBuffer: { type: String, default: '' },
  jerseyError: { type: String, default: '' },
})
const emit = defineEmits(['change', 'delete'])

const section = useTemplateRef('section')
defineExpose({ focusSection: () => section.value?.focus() })

const DESTINATIONS = [
  { field: 'is_highlight', label: 'היילייטס (H)', key: 'H' },
  { field: 'in_game_briefing', label: 'תדריך משחק (B)', key: 'B' },
  { field: 'in_player_briefing', label: 'תדריך שחקן (P)', key: 'P' },
]
const NUDGES = [
  { which: 'start', delta: -1, label: 'התחלה פחות שנייה', text: '−1', keys: '[' },
  { which: 'start', delta: 1, label: 'התחלה ועוד שנייה', text: '+1', keys: ']' },
  { which: 'end', delta: -1, label: 'סוף פחות שנייה', text: '−1', keys: 'Shift+[' },
  { which: 'end', delta: 1, label: 'סוף ועוד שנייה', text: '+1', keys: 'Shift+]' },
]

const time = (seconds) => (seconds === null ? '--:--' : formatTimestamp(seconds))
const canNudge = (n) => nudge(props.clip, n.which, n.delta) !== null
const toggleTag = (id) =>
  emit('change', { player_ids: props.clip.player_ids.includes(id) ? props.clip.player_ids.filter((p) => p !== id) : [...props.clip.player_ids, id] })
const text = (field, value) => emit('change', { [field]: value.trim() || null })
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-2xl font-black tabular-nums" dir="ltr" data-test="range">{{ time(clip.start) }} – {{ time(clip.end) }}</p>
      <p class="text-sm text-muted" aria-live="polite">
        <template v-if="clip.status === 'saving'">שומר…</template>
        <template v-else-if="clip.status === 'saved'">נשמר</template>
      </p>
    </div>
    <div v-if="clip.status === 'error'" class="space-y-1">
      <span class="badge-loss">לא נשמר</span>
      <p class="error-text" role="alert">{{ clip.error }}</p>
    </div>

    <div class="flex flex-wrap gap-2" role="group" aria-label="כוונון טווח הקטע">
      <button
        v-for="n in NUDGES"
        :key="n.label"
        type="button"
        class="btn-secondary"
        :aria-label="n.label"
        :aria-keyshortcuts="n.keys"
        :disabled="!canNudge(n)"
        @click="emit('change', nudge(clip, n.which, n.delta))"
      >
        <span aria-hidden="true">{{ n.which === 'start' ? 'התחלה' : 'סוף' }} {{ n.text }}</span>
      </button>
    </div>

    <div class="segmented flex-wrap" role="group" aria-label="יעד הקטע">
      <button
        v-for="d in DESTINATIONS.filter((d) => !needsGame(d.field) || clip.game_id !== null)"
        :key="d.field"
        type="button"
        class="segmented-item"
        :aria-pressed="clip[d.field]"
        :aria-keyshortcuts="d.key"
        @click="emit('change', { [d.field]: !clip[d.field] })"
      >
        {{ d.label }}
      </button>
    </div>
    <p v-if="clip.in_player_briefing && !clip.player_ids.length" class="text-sm text-muted">תייגו שחקן כדי שהקטע יגיע לתדריך שלו</p>

    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="field-label">שחקנים בקטע</h3>
        <span v-if="jerseyBuffer" class="badge-muted" dir="ltr">#{{ jerseyBuffer }}…</span>
        <span v-if="jerseyError" class="error-text" role="alert">{{ jerseyError }}</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="p in roster"
          :key="p.id"
          type="button"
          class="btn-secondary"
          :aria-pressed="clip.player_ids.includes(p.id)"
          :class="clip.player_ids.includes(p.id) && 'ring-2 ring-team'"
          @click="toggleTag(p.id)"
        >
          <span dir="ltr">#{{ p.jersey_number ?? '' }}</span> {{ p.name }}
        </button>
      </div>
    </div>

    <div>
      <label for="studio-section" class="field-label">פרק</label>
      <input
        id="studio-section"
        ref="section"
        class="field-input"
        list="studio-sections"
        maxlength="200"
        aria-keyshortcuts="S"
        :value="clip.section ?? ''"
        @change="text('section', $event.target.value)"
      />
      <datalist id="studio-sections">
        <option v-for="s in sections" :key="s" :value="s"></option>
      </datalist>
    </div>
    <div>
      <label for="studio-note" class="field-label">הערה</label>
      <textarea id="studio-note" class="field-input" rows="3" maxlength="2000" :value="clip.note ?? ''" @change="text('note', $event.target.value)"></textarea>
    </div>

    <button type="button" class="btn-danger-ghost" aria-keyshortcuts="Delete" @click="emit('delete')">מחיקת הקטע</button>
  </div>
</template>
