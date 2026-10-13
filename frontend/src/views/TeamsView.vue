<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import SearchInput from '../components/SearchInput.vue'
import { matchesQuery } from '../lib/search'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { useTeams } from '../composables/useTeams'

const LOGO_URL = '/logo.jpg'
const UNGROUPED = 'קבוצות נוספות'

const { error, list } = useTeams()
const { selectedTeamId } = useSelectedTeam()
const teams = ref(null) // null = loading
const query = ref('')
const searchInput = ref(null)

onMounted(async () => {
  teams.value = (await list()) ?? []
})

// Match on name, English name or club, so typing a club name shows its whole group.
const filteredTeams = computed(() => {
  return (teams.value ?? []).filter((t) => matchesQuery(query.value, [t.name, t.name_en, t.club]))
})

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

// Clubs in first-appearance order, teams without a club last.
const groups = computed(() => {
  const byClub = new Map()
  for (const team of filteredTeams.value) {
    const club = team.club?.trim() || UNGROUPED
    if (!byClub.has(club)) byClub.set(club, [])
    byClub.get(club).push(team)
  }
  const ungrouped = byClub.get(UNGROUPED)
  byClub.delete(UNGROUPED)
  const result = [...byClub].map(([club, clubTeams]) => ({ club, teams: clubTeams }))
  if (ungrouped) result.push({ club: UNGROUPED, teams: ungrouped })
  return result
})
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">קבוצות</h1>
      <SearchInput v-if="teams?.length" id="team-search" ref="searchInput" v-model="query" label="חיפוש קבוצה" class="w-full sm:w-72" />
    </div>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <div v-else-if="teams === null" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <div v-for="n in 8" :key="n" class="skeleton h-36"></div>
    </div>
    <p v-else-if="!teams.length" class="empty-state">אין קבוצות עדיין.</p>
    <div v-else-if="!groups.length" class="empty-state" aria-live="polite">
      <p>אין קבוצות התואמות לחיפוש "{{ query.trim() }}".</p>
      <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
    </div>
    <div v-else class="space-y-10 sm:space-y-14">
      <section v-for="group in groups" :key="group.club">
        <h2 v-if="group.club !== UNGROUPED || groups.length > 1" class="section-title">{{ group.club }}</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <RouterLink
            v-for="team in group.teams"
            :key="team.id"
            :to="'/' + teamSlug(team)"
            :aria-current="String(team.id) === selectedTeamId ? 'true' : undefined"
            :class="[
              'card flex flex-col items-center gap-3 text-center transition-colors hover:border-team',
              String(team.id) === selectedTeamId && 'border-team',
            ]"
          >
            <img
              :src="team.logo_url || LOGO_URL"
              alt=""
              class="size-16 rounded-xl bg-white object-contain p-1 sm:size-20"
            />
            <span class="line-clamp-2 font-bold text-ink">{{ team.name }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
