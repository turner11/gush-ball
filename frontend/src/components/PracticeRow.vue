<script setup>
import { computed } from 'vue'

import { formatGameDate } from '../lib/format'

// One practice row (team schedule and admin list). The optional `actions` slot is a full-width row under the content.
const props = defineProps({ practice: { type: Object, required: true } })

const d = computed(() => formatGameDate(props.practice.starts_at))
const endTime = computed(() => {
  const end = new Date(new Date(props.practice.starts_at).getTime() + props.practice.duration_minutes * 60000)
  return formatGameDate(end)?.time
})
</script>

<template>
  <li class="flex flex-wrap items-center gap-3 border-s-4 border-transparent px-4 py-3 sm:gap-4 sm:px-5">
    <div v-if="d" class="w-11 shrink-0 text-center leading-none">
      <span class="block text-2xl font-black tabular-nums">{{ d.day }}</span>
      <span class="block text-xs font-bold text-muted">{{ d.month }}</span>
    </div>
    <div class="min-w-0 flex-1">
      <p v-if="d" :class="['font-bold', practice.cancelled && 'text-muted line-through']">{{ d.weekday }} · {{ d.time }}–{{ endTime }}</p>
      <p v-if="practice.location" class="break-words text-sm text-muted">{{ practice.location }}</p>
      <p v-if="practice.notes" class="break-words text-sm text-muted">{{ practice.notes }}</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <span v-if="practice.cancelled" class="badge badge-loss">בוטל</span>
      <span class="badge badge-muted">אימון</span>
    </div>
    <div v-if="$slots.actions" class="flex basis-full flex-wrap gap-1"><slot name="actions" /></div>
  </li>
</template>
