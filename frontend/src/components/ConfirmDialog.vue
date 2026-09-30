<script setup>
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'

defineProps({
  open: { type: Boolean, default: false },
  message: { type: String, required: true },
})

const emit = defineEmits(['confirm', 'update:open'])

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('update:open', false)
}
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="(value) => emit('update:open', value)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <AlertDialogContent
        class="fixed inset-x-0 bottom-0 z-50 space-y-4 rounded-t-3xl border-t border-line bg-raised p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
      >
        <AlertDialogTitle class="section-title">אישור פעולה</AlertDialogTitle>
        <AlertDialogDescription>{{ message }}</AlertDialogDescription>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button type="button" class="btn-secondary" @click="onCancel">ביטול</button>
          <button type="button" class="btn-danger" @click="onConfirm">אישור</button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
