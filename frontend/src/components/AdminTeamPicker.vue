<script setup>
import { computed, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useLeagueFilter } from '../composables/useLeagueFilter'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import FilterCombobox from './FilterCombobox.vue'

// League + team pickers for the /:slug/admin/* pages; picking a team navigates to its slug.
const props = defineProps({ teams: { type: Array, required: true } })

const route = useRoute()
const router = useRouter()
const { selectedTeamId } = useSelectedTeam()
const { leagueId, leagueOptions, teamsInLeague } = useLeagueFilter(toRef(props, 'teams'))

const teamOptions = computed(() => teamsInLeague.value.map((t) => ({ value: teamSlug(t), label: t.name })))
const goToTeam = (slug) => router.push({ params: { slug } })

// Picking a league jumps to its first team, so the team picker never shows a team outside the chosen league.
watch(leagueId, () => {
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
      :model-value="route.params.slug"
      class="w-full sm:w-64"
      @update:model-value="goToTeam"
    />
  </div>
</template>
