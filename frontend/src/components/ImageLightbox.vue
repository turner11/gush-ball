<script setup>
import { computed, ref } from 'vue'

import AppIcon from './AppIcon.vue'

// Full-screen viewer for a list of { url, alt }. Callers render the thumbnails and call open(index, event).
const props = defineProps({ images: { type: Array, required: true } })

const dialog = ref(null)
const openIndex = ref(null)
const current = computed(() => (openIndex.value == null ? null : props.images[openIndex.value]))
let opener = null // the thumbnail that opened the dialog, refocused on close

function open(index, event) {
  opener = event.currentTarget
  openIndex.value = index
  dialog.value.showModal()
}

function step(delta) {
  const n = props.images.length
  openIndex.value = (openIndex.value + delta + n) % n
}

function onKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const rtl = document.documentElement.dir === 'rtl'
  step((e.key === 'ArrowLeft') === rtl ? 1 : -1)
  e.preventDefault()
}

// Fires for Esc, the close button and dialog.close() alike. Explicit focus: Safari never focuses a clicked button.
function onClose() {
  openIndex.value = null
  opener?.focus()
}

defineExpose({ open })
</script>

<template>
  <dialog
    ref="dialog"
    aria-label="תמונה בגודל מלא"
    class="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-transparent p-0 text-white backdrop:bg-black/90"
    @close="onClose"
    @keydown="onKey"
  >
    <button type="button" class="btn-icon absolute end-2 top-2 z-10 bg-black/50" aria-label="סגירה" @click="dialog.close()">
      <AppIcon name="close" />
    </button>
    <img v-if="current" :src="current.url" :alt="current.alt" class="size-full object-contain p-4 sm:p-12" />
    <template v-if="images.length > 1">
      <button type="button" class="btn-icon absolute start-2 top-1/2 z-10 -translate-y-1/2 bg-black/50" aria-label="התמונה הקודמת" @click="step(-1)">
        <AppIcon name="chevron" class="size-5 ltr:rotate-90 rtl:-rotate-90" />
      </button>
      <button type="button" class="btn-icon absolute end-2 top-1/2 z-10 -translate-y-1/2 bg-black/50" aria-label="התמונה הבאה" @click="step(1)">
        <AppIcon name="chevron" class="size-5 ltr:-rotate-90 rtl:rotate-90" />
      </button>
      <p class="absolute inset-x-0 bottom-3 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {{ openIndex + 1 }} / {{ images.length }}
      </p>
    </template>
  </dialog>
</template>
