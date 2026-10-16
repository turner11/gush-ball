<script setup>
// Owns the sync run state: the slot gets `start(path, body)` and `busy`; status text renders below the slot.
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { apiFetch } from '../lib/api'
import { formatDuration } from '../lib/format'

const emit = defineEmits(['finished'])

const POLL_MS = 3000

const submitting = ref(false)
const running = ref(false)
const result = ref(null)
const error = ref(null)
let timer = null
let unmounted = false

function stopPolling() {
  clearInterval(timer)
  timer = null
}

const resultText = computed(() =>
  [
    result.value?.standings != null && `${result.value.standings} שורות טבלה`,
    result.value?.games != null && `${result.value.games} משחקים`,
    result.value?.players != null && `${result.value.players} שחקנים`,
  ]
    .filter(Boolean)
    .join(', '),
)
const elapsedText = computed(() =>
  typeof result.value?.elapsed_seconds === 'number' ? formatDuration(result.value.elapsed_seconds) : '',
)

async function refreshStatus() {
  try {
    const s = await apiFetch('/sync/status')
    if (unmounted) return
    const wasRunning = running.value
    running.value = s.running
    if (s.finished_at) result.value = s
    if (s.running) {
      timer ??= setInterval(refreshStatus, POLL_MS)
    } else {
      stopPolling()
      if (wasRunning) emit('finished')
    }
  } catch (err) {
    stopPolling()
    running.value = false
    error.value = err.message
  }
}

async function start(path, body) {
  submitting.value = true
  result.value = null
  error.value = null
  try {
    await apiFetch(path, { method: 'POST', body })
    running.value = true
    timer ??= setInterval(refreshStatus, POLL_MS)
  } catch (err) {
    error.value = err.message
  } finally {
    submitting.value = false
  }
}

onMounted(refreshStatus)
onUnmounted(() => {
  unmounted = true
  stopPolling()
})
</script>

<template>
  <div class="space-y-2">
    <slot :start="start" :busy="submitting || running" />
    <p v-if="running" class="text-sm text-muted">
      הסנכרון רץ… זה עלול לקחת כמה דקות.
    </p>
    <div v-else-if="result" class="text-sm text-muted">
      <p v-if="result.failed" class="error-text">הסנכרון נכשל.</p>
      <p v-else>
        הסנכרון הסתיים<template v-if="elapsedText"> תוך {{ elapsedText }}</template>: {{ resultText }}.
      </p>
      <ul v-if="result.errors.length" class="error-text list-disc ps-5">
        <li v-for="e in result.errors" :key="e">{{ e }}</li>
      </ul>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </div>
</template>
