<script setup>
import { DialogContent, DialogDescription, DialogOverlay, DialogRoot, DialogTitle } from 'reka-ui'

defineProps({
  open: { type: Boolean, default: false },
  message: { type: String, required: true },
})

const emit = defineEmits(['confirm', 'cancel', 'update:open'])

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  emit('update:open', false)
  emit('cancel')
}
</script>

<template>
  <DialogRoot :open="open" :modal="false" @update:open="(value) => !value && onCancel()">
    <DialogOverlay class="fixed inset-0 bg-black/50" />
    <DialogContent
      class="card fixed start-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4"
    >
      <DialogTitle class="section-title">אישור פעולה</DialogTitle>
      <DialogDescription>{{ message }}</DialogDescription>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="onCancel">ביטול</button>
        <button type="button" class="btn-primary" @click="onConfirm">אישור</button>
      </div>
    </DialogContent>
  </DialogRoot>
</template>
