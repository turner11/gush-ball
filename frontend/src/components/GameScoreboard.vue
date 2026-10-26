<script setup>
import { computed } from 'vue'

import { formatGameDate } from '../lib/format'
import { homeFirst, played, result } from '../lib/games'

// Two sides (home first), then the score with a W/L badge, or the kick-off time and date when unplayed.
const props = defineProps({
  game: { type: Object, required: true },
  team: { type: Object, required: true },
  large: { type: Boolean, default: false },
})

const d = computed(() => formatGameDate(props.game.scheduled_at))
const sides = computed(() => {
  const g = props.game
  const us = { name: props.team.name, logo: props.team.logo_url || '/logo.jpg', score: g.team_score, url: props.team.ibasketball_team_url }
  const them = { name: g.opponent.name, logo: g.opponent.logo_url, score: g.opponent_score, url: g.opponent.source_url }
  return homeFirst(g, us, them)
})
</script>

<template>
  <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
    <div class="min-w-0 space-y-1">
      <img v-if="sides[0].logo" :src="sides[0].logo" alt="" class="mx-auto size-12 object-contain" :class="large ? 'sm:size-24' : 'sm:size-14'" />
      <p class="line-clamp-2 break-words text-balance text-sm font-bold" :class="{ 'sm:text-lg': large }"><a v-if="sides[0].url" :href="sides[0].url" target="_blank" rel="noopener" class="hover:underline">{{ sides[0].name }}</a
        ><template v-else>{{ sides[0].name }}</template></p>
    </div>
    <div class="space-y-1">
      <template v-if="played(game)">
        <p class="score" :class="{ 'sm:text-6xl': large }">{{ sides[0].score }} : {{ sides[1].score }}</p>
        <span v-if="result(game)" :class="['badge', result(game) === 'W' ? 'badge-win' : 'badge-loss']">{{
          result(game) === 'W' ? 'ניצחון' : 'הפסד'
        }}</span>
      </template>
      <template v-else-if="d">
        <p class="text-2xl font-black tabular-nums" :class="{ 'sm:text-6xl': large }">{{ d.time }}</p>
        <p class="text-xs text-muted" :class="{ 'sm:text-sm': large }">
          {{ d.weekday }} {{ d.day }}
          {{ d.month }}
        </p>
      </template>
    </div>
    <div class="min-w-0 space-y-1">
      <img v-if="sides[1].logo" :src="sides[1].logo" alt="" class="mx-auto size-12 object-contain" :class="large ? 'sm:size-24' : 'sm:size-14'" />
      <p class="line-clamp-2 break-words text-balance text-sm font-bold" :class="{ 'sm:text-lg': large }"><a v-if="sides[1].url" :href="sides[1].url" target="_blank" rel="noopener" class="hover:underline">{{ sides[1].name }}</a
        ><template v-else>{{ sides[1].name }}</template></p>
    </div>
  </div>
</template>
