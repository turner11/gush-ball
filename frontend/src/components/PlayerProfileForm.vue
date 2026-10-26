<script setup>
import { onMounted, ref } from 'vue'

import ImageUpload from './ImageUpload.vue'
import PlayerVideosEditor from './PlayerVideosEditor.vue'
import { apiFetch } from '../lib/api'

const props = defineProps({
  player: { type: Object, required: true },
  withName: { type: Boolean, default: false }, // the name is a property: only the linked player edits it here (#496)
})
const emit = defineEmits(['saved', 'cancel'])

const name = ref(props.player.name)
const nameEn = ref(props.player.name_en ?? '')
const nameInput = ref(null)
const uploadWrap = ref(null)
const saving = ref(false)
const error = ref('')

onMounted(() => (nameInput.value ?? uploadWrap.value?.querySelector('button, input'))?.focus())

async function save() {
  if (!props.withName) return
  saving.value = true
  error.value = ''
  try {
    const updated = await apiFetch(`/teams/${props.player.team_id}/players/${props.player.id}`, {
      method: 'PATCH',
      body: { name: name.value, name_en: nameEn.value || null },
    })
    emit('saved', { ...updated, images: props.player.images, videos: props.player.videos })
  } catch {
    error.value = 'שגיאה בשמירת הפרופיל, נסו שוב'
  } finally {
    saving.value = false
  }
}

async function addImage(url) {
  error.value = ''
  try {
    const image = await apiFetch(`/players/${props.player.id}/images`, { method: 'POST', body: { url } })
    emit('saved', { ...props.player, images: [...props.player.images, image] })
  } catch {
    error.value = 'שגיאה בהוספת תמונה, נסו שוב'
  }
}

async function removeImage(image) {
  error.value = ''
  try {
    await apiFetch(`/players/${props.player.id}/images/${image.id}`, { method: 'DELETE' })
    emit('saved', { ...props.player, images: props.player.images.filter((i) => i.id !== image.id) })
  } catch {
    error.value = 'שגיאה במחיקת התמונה, נסו שוב'
  }
}
</script>

<template>
  <form id="profile-form" class="card max-w-xl space-y-3" @submit.prevent="save">
    <template v-if="withName">
      <div>
        <label for="profile-name" class="field-label">שם</label>
        <input id="profile-name" ref="nameInput" v-model="name" type="text" required class="field-input" />
      </div>
      <div>
        <label for="profile-name-en" class="field-label">שם באנגלית</label>
        <input id="profile-name-en" v-model="nameEn" type="text" dir="ltr" class="field-input" />
      </div>
    </template>

    <div>
      <h2 class="field-label">תמונות</h2>
      <ul v-if="player.images.length" class="space-y-2">
        <li v-for="image in player.images" :key="image.id" class="flex items-center gap-3">
          <img :src="image.url" alt="" class="size-12 rounded object-cover object-top" />
          <button type="button" class="btn-danger-ghost" aria-label="הסר תמונה" @click="removeImage(image)">הסר</button>
        </li>
      </ul>
      <p v-else class="empty-state">אין תמונות עדיין</p>
      <div ref="uploadWrap" class="mt-2"><ImageUpload label="העלאת תמונה" @uploaded="addImage" /></div>
    </div>

    <div>
      <h2 class="field-label">סרטונים</h2>
      <PlayerVideosEditor :player="player" @change="(videos) => emit('saved', { ...player, videos })" />
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>

    <div class="flex gap-2">
      <button v-if="withName" type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'שומר…' : 'שמירה' }}</button>
      <button type="button" class="btn-secondary" @click="emit('cancel')">{{ withName ? 'ביטול' : 'סגירה' }}</button>
    </div>
  </form>
</template>
