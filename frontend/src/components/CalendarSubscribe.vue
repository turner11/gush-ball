<script setup>
import { computed, ref } from 'vue'

import { apiUrl } from '../lib/api'
import AppIcon from './AppIcon.vue'

const props = defineProps({ teamId: { type: Number, required: true } })

const feedUrl = computed(() => apiUrl(`/teams/${props.teamId}/calendar.ics`))
const webcalUrl = computed(() => feedUrl.value.replace(/^https?:/, 'webcal:'))

const copied = ref(false)
const copyFailed = ref(false)

async function copy() {
  copied.value = false
  copyFailed.value = false
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    copied.value = true
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <a :href="webcalUrl" class="btn-secondary"><AppIcon name="calendar" />הוסף ליומן</a>
    <button type="button" class="btn-ghost" @click="copy">העתקת קישור ל-Google</button>
    <p v-if="copied" role="status" aria-live="polite" class="basis-full text-sm text-muted">הקישור הועתק</p>
    <p v-else-if="copyFailed" role="status" aria-live="polite" class="basis-full text-sm text-muted">
      לא ניתן להעתיק, העתיקו ידנית:
      <code dir="ltr" class="select-all break-all">{{ feedUrl }}</code>
    </p>
  </div>
</template>
