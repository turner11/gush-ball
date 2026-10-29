<script setup>
import { computed } from 'vue'

import GameRow from './GameRow.vue'

// A game list folded to its top `limit` rows: one faded, inert peek row hints at more, and a toggle shows them all.
// Two root nodes (list + toggle), so the caller's space-y spaces them; `expanded` may be bound by the parent or left local.
const props = defineProps({
  games: { type: Array, required: true }, // already sorted
  limit: { type: Number, required: true },
  listId: { type: String, required: true }, // the <ol> id, which the toggle controls
  allLabel: { type: String, required: true },
  teamOf: { type: Function, required: true }, // game => team
  showTeam: { type: Boolean, default: false },
})
const expanded = defineModel('expanded', { default: false })

const shown = computed(() => (expanded.value ? props.games : props.games.slice(0, props.limit)))
const peek = computed(() => (expanded.value ? null : (props.games[props.limit] ?? null)))
const foldable = computed(() => props.games.length > props.limit)
</script>

<template>
  <ol :id="listId" class="card divide-y divide-line overflow-hidden p-0">
    <template v-for="game in shown" :key="game.id">
      <GameRow :game="game" :team="teamOf(game)" :show-team="showTeam">
        <template v-if="$slots.actions" #actions><slot name="actions" :game="game" /></template>
      </GameRow>
      <slot name="after" :game="game" />
    </template>
    <GameRow v-if="peek" :game="peek" :team="teamOf(peek)" :show-team="showTeam" inert aria-hidden="true" class="max-h-14 overflow-hidden opacity-60 mask-b-to-transparent" />
  </ol>
  <button
    v-if="foldable"
    type="button"
    class="btn-ghost w-full sm:w-auto"
    :aria-controls="listId"
    :aria-expanded="expanded"
    @click="expanded = !expanded"
  >{{ expanded ? 'הצגת פחות' : `${allLabel} (${games.length})` }}</button>
</template>
