<script setup>
import { ref } from 'vue'

import { apiFetch } from '../lib/api'

const props = defineProps({ player: { type: Object, required: true } })
const emit = defineEmits(['change'])

const title = ref('')
const url = ref('')
const adding = ref(false)
const error = ref('')

async function add() {
  if (adding.value || !title.value.trim() || !url.value.trim()) return
  adding.value = true
  error.value = ''
  try {
    const video = await apiFetch(`/players/${props.player.id}/videos`, {
      method: 'POST',
      body: { title: title.value, url: url.value },
    })
    emit('change', [...props.player.videos, video])
    title.value = ''
    url.value = ''
  } catch (e) {
    error.value = e.status === 422 ? 'קישור יוטיוב לא תקין (youtube.com / youtu.be)' : 'שגיאה בהוספת סרטון, נסה שוב'
  } finally {
    adding.value = false
  }
}

async function remove(video) {
  error.value = ''
  try {
    await apiFetch(`/players/${props.player.id}/videos/${video.id}`, { method: 'DELETE' })
    emit('change', props.player.videos.filter((v) => v.id !== video.id))
  } catch {
    error.value = 'שגיאה במחיקת הסרטון, נסה שוב'
  }
}
</script>

<template>
  <div class="space-y-2">
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <ul v-if="player.videos.length" class="space-y-2">
      <li v-for="video in player.videos" :key="video.id" class="flex items-center gap-3">
        <span class="min-w-0 flex-1 truncate">{{ video.title }}</span>
        <button
          type="button"
          class="btn-danger-ghost"
          data-testid="remove-video"
          :aria-label="`הסר סרטון — ${video.title}`"
          @click="remove(video)"
        >
          הסר
        </button>
      </li>
    </ul>
    <p v-else class="empty-state">אין סרטונים עדיין</p>

    <div>
      <label for="player-video-title" class="field-label">כותרת הסרטון</label>
      <input id="player-video-title" v-model="title" type="text" maxlength="200" class="field-input" @keydown.enter.prevent="add" />
    </div>
    <div>
      <label for="player-video-url" class="field-label">קישור יוטיוב</label>
      <input
        id="player-video-url"
        v-model="url"
        type="url"
        dir="ltr"
        inputmode="url"
        aria-describedby="player-video-hint"
        class="field-input"
        @keydown.enter.prevent="add"
      />
      <p id="player-video-hint" class="text-sm text-muted">youtube.com או youtu.be</p>
    </div>
    <button type="button" class="btn-secondary" data-testid="add-video" :disabled="adding" @click="add">
      {{ adding ? 'מוסיף…' : 'הוספת סרטון' }}
    </button>
  </div>
</template>
