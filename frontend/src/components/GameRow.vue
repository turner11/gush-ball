<script setup>
import { computed } from 'vue'

import { formatGameDate } from '../lib/format'
import { homeFirst, played, result, STATUS_LABELS } from '../lib/games'
import GameLocationLinks from './GameLocationLinks.vue'
import GameStatsLink from './GameStatsLink.vue'

// One schedule row. The default slot replaces the live-stats link (the admin list puts its actions there).
const props = defineProps({ game: { type: Object, required: true }, team: { type: Object, default: null } })

const d = computed(() => formatGameDate(props.game.scheduled_at))
const sides = computed(() => {
  const g = props.game
  const us = { name: props.team?.name, logo: props.team?.logo_url, url: props.team?.ibasketball_team_url }
  const them = { name: g.opponent.name, logo: g.opponent.logo_url, url: g.opponent.source_url }
  return homeFirst(g, us, them)
})
const address = computed(() => (props.game.is_home ? props.team?.home_court_address : props.game.opponent?.address))
const edge = computed(() => ({ W: 'border-win', L: 'border-loss' })[result(props.game)] ?? 'border-transparent')
</script>

<template>
  <li :class="['flex items-center gap-3 border-s-4 px-4 py-3 sm:gap-4 sm:px-5', edge]">
    <div v-if="d" class="w-11 shrink-0 text-center leading-none">
      <span class="block text-2xl font-black tabular-nums">{{ d.day }}</span>
      <span class="block text-xs font-bold text-muted">{{ d.month }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <template v-for="(side, i) in sides" :key="i">
        <img v-if="side.logo" :src="side.logo" alt="" class="size-10 shrink-0 object-contain" />
        <span v-else class="size-10 shrink-0 rounded-full bg-sunken"></span>
      </template>
    </div>
    <div class="min-w-0 flex-1">
      <p class="break-words font-bold">
        <template v-for="(side, i) in sides" :key="i">
          <span v-if="i" class="font-normal text-muted"> - </span>
          <a v-if="side.url" :href="side.url" target="_blank" rel="noopener" class="hover:underline">{{ side.name }}</a>
          <template v-else>{{ side.name }}</template>
        </template>
      </p>
      <p v-if="d" class="text-sm text-muted">{{ d.weekday }} · {{ d.time }} · <span class="badge badge-muted">{{ game.is_home ? 'בית' : 'חוץ' }}</span></p>
      <slot><GameStatsLink :game="game" class="section-link" /></slot>
    </div>
    <div class="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
      <GameLocationLinks v-if="address" :address="address" />
      <template v-if="played(game)">
        <span class="text-xl font-black tabular-nums">{{ homeFirst(game, game.team_score, game.opponent_score).join(' : ') }}</span>
        <span v-if="result(game)" :class="['badge', result(game) === 'W' ? 'badge-win' : 'badge-loss']">{{ result(game) === 'W' ? 'ניצחון' : 'הפסד' }}</span>
      </template>
      <span v-else class="badge badge-muted">{{ STATUS_LABELS[game.status] ?? game.status }}</span>
    </div>
  </li>
</template>
