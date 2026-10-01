<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { gameStatsRoute, liveStatsUrl } from '../lib/games'
import AppIcon from './AppIcon.vue'

// Lineups once the game has stats; otherwise the admin-only live Streamlit link; otherwise nothing.
// Styling comes from the caller (attribute fallthrough).
const props = defineProps({ game: { type: Object, required: true } })
const { user } = useAuth()
const liveUrl = computed(() => liveStatsUrl(props.game, user.value))
</script>

<template>
  <RouterLink v-if="game.has_stats" :to="gameStatsRoute(game)" :aria-label="'סטטיסטיקת המשחק נגד ' + game.opponent.name">סטטיסטיקה</RouterLink>
  <a
    v-else-if="liveUrl"
    :href="liveUrl"
    target="_blank"
    rel="noopener"
    :aria-label="'סטטיסטיקה חיה למשחק נגד ' + game.opponent.name + ' (נפתח בלשונית חדשה)'"
  >סטטיסטיקה חיה<AppIcon name="external" /></a>
</template>
