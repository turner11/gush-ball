<script setup>
import { computed, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useLeagueFilter } from '../composables/useLeagueFilter'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import FilterCombobox from './FilterCombobox.vue'

// League + team pickers for the /:slug/admin/* pages; picking a team navigates to its slug.
// Optional `all-label` adds an 'all teams' row bound to `v-model:all`.
const props = defineProps({ teams: { type: Array, required: true }, allLabel: { type: String, default: null } })
const all = defineModel('all', { type: Boolean, default: false })

const route = useRoute()
const router = useRouter()
const { selectedTeamId } = useSelectedTeam()
const { leagueId, leagueOptions, teamsInLeague } = useLeagueFilter(toRef(props, 'teams'))

const teamOptions = computed(() => teamsInLeague.value.map((t) => ({ value: teamSlug(t), label: t.name })))
const goToTeam = (slug) => router.push({ params: { slug } })
function pickTeam(slug) {
  all.value = !slug
  if (slug) goToTeam(slug)
}

// Picking a league jumps to its first team, so the team picker never shows a team outside the chosen league.
watch(leagueId, () => {
  all.value = false
  const [first] = teamsInLeague.value
  if (first && !teamsInLeague.value.some((t) => String(t.id) === selectedTeamId.value)) goToTeam(teamSlug(first))
})
</script>

<template>
  <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
    <FilterCombobox
      v-if="leagueOptions.length > 1"
      id="league-filter"
      v-model="leagueId"
      label="ליגה"
      all-label="כל הליגות"
      :options="leagueOptions"
      class="w-full sm:w-64"
    />
    <FilterCombobox
      id="team-select"
      label="קבוצה"
      :options="teamOptions"
      :all-label="allLabel"
      :model-value="all ? '' : route.params.slug"
      class="w-full sm:w-64"
      @update:model-value="pickTeam"
    />
  </div>
</template>
