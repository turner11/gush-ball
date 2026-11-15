<script setup>
import { ref, watch } from 'vue'

import { formatTimestamp, parseTimestamp, videoSegment, withVideoSegment, youtubeEmbedUrl } from '../lib/youtube'

// v-model is the video URL; the clip lives in it as t= / end=. id prefixes the input ids (several rows per page).
const props = defineProps({ modelValue: { type: String, default: '' }, id: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])

const error = ref('')
watch(() => props.modelValue, () => (error.value = ''))

const shown = (seconds) => (seconds === null ? '' : formatTimestamp(seconds))

function change(which, event) {
  const typed = parseTimestamp(event.target.value)
  const segment = { ...videoSegment(props.modelValue), [which]: typed }
  if (Number.isNaN(typed)) error.value = 'זמן לא תקין, למשל 1:30'
  else if (segment.start !== null && segment.end !== null && segment.end <= segment.start) error.value = 'סוף הקטע חייב להיות אחרי ההתחלה'
  else {
    error.value = ''
    emit('update:modelValue', withVideoSegment(props.modelValue, segment.start, segment.end))
    return
  }
  event.target.value = shown(videoSegment(props.modelValue)[which]) // snap back: the URL is unchanged
}
</script>

<template>
  <fieldset v-if="youtubeEmbedUrl(modelValue)" class="space-y-1">
    <legend class="field-label">קטע מהסרטון (לא חובה)</legend>
    <div class="grid grid-cols-2 gap-2">
      <div v-for="[which, label] in [['start', 'התחלה'], ['end', 'סוף']]" :key="which">
        <label :for="`${id}-${which}`" class="text-sm text-muted">{{ label }}</label>
        <input
          :id="`${id}-${which}`"
          :value="shown(videoSegment(modelValue)[which])"
          type="text"
          dir="ltr"
          inputmode="text"
          autocomplete="off"
          placeholder="0:00"
          :aria-describedby="error ? `${id}-hint ${id}-error` : `${id}-hint`"
          class="field-input"
          @change="change(which, $event)"
        />
      </div>
    </div>
    <p :id="`${id}-hint`" class="text-sm text-muted">דקות:שניות, למשל 12:40</p>
    <p v-if="error" :id="`${id}-error`" class="error-text" role="alert">{{ error }}</p>
  </fieldset>
</template>
