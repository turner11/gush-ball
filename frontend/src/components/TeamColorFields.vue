<script setup>
const primary = defineModel('primary')
const secondary = defineModel('secondary')
</script>

<template>
  <div>
    <label for="team-primary-color" class="field-label">צבע ראשי</label>
    <div class="mt-1 flex items-center gap-2">
      <input id="team-primary-color" v-model="primary" type="color" class="h-11 w-16 rounded" />
      <span class="text-sm tabular-nums" dir="ltr">{{ primary || '#000000' }}</span>
    </div>
  </div>
  <div>
    <label for="team-secondary-color" class="field-label">צבע משני</label>
    <div class="mt-1 flex items-center gap-2">
      <input id="team-secondary-color" v-model="secondary" type="color" class="h-11 w-16 rounded" />
      <span class="text-sm tabular-nums" dir="ltr">{{ secondary || '#000000' }}</span>
    </div>
  </div>
</template>
