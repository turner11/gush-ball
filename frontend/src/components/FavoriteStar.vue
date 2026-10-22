<script setup>
import { computed } from 'vue'

import { viewer } from '../composables/useAuth'
import { useFavorites } from '../composables/useFavorites'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  teamId: { type: Number, required: true },
  name: { type: String, required: true },
})

const { favoriteIds, toggle } = useFavorites()
const on = computed(() => favoriteIds.value.has(props.teamId))
</script>

<template>
  <button
    v-if="viewer"
    type="button"
    class="btn-icon"
    :aria-pressed="on"
    :aria-label="'מועדפים: ' + name"
    :title="on ? 'הסר מהמועדפים' : 'הוסף למועדפים'"
    @click="toggle(teamId)"
  >
    <AppIcon name="star" :class="{ 'fill-current': on }" />
  </button>
</template>
