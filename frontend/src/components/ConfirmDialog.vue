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
      <AlertDialogOverlay class="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <AlertDialogContent
        class="card fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4"
      >
        <AlertDialogTitle class="section-title">אישור פעולה</AlertDialogTitle>
        <AlertDialogDescription>{{ message }}</AlertDialogDescription>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="onCancel">ביטול</button>
          <button type="button" class="btn-primary !bg-red-600 !text-white" @click="onConfirm">אישור</button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
