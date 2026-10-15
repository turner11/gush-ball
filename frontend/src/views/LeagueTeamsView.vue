<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import TeamCard from '../components/TeamCard.vue'
import { teamSlug } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'

const route = useRoute()
const data = ref(null) // null = loading
const errorStatus = ref(null)

async function load() {
  data.value = null
  errorStatus.value = null
  try {
    const [ours, result] = await Promise.all([apiFetch('/teams'), apiFetch(`/leagues/${route.params.leagueId}/teams`)])
    const byId = new Map(ours.map((t) => [t.id, t]))
    data.value = {
      league: result.league,
      onSite: result.teams.filter((t) => byId.has(t.team_id)).map((t) => byId.get(t.team_id)),
      notOnSite: result.teams.filter((t) => !byId.has(t.team_id)),
    }
  } catch (err) {
    errorStatus.value = err.status ?? 0
  }
}
watch(() => route.params.leagueId, load, { immediate: true })

const empty = computed(() => data.value && !data.value.onSite.length && !data.value.notOnSite.length)
</script>

<template>
  <div>
    <RouterLink :to="{ name: 'teams' }" class="section-link mb-3 inline-block">→ כל הליגות</RouterLink>

    <div v-if="errorStatus === 404" class="empty-state">
      <p>הליגה לא נמצאה</p>
      <RouterLink :to="{ name: 'teams' }" class="btn-secondary mt-3">חזרה לקבוצות</RouterLink>
    </div>
    <div v-else-if="errorStatus !== null" class="space-y-3">
      <p class="error-text" role="alert">לא הצלחנו לטעון את קבוצות הליגה מאתר האיגוד</p>
      <button type="button" class="btn-secondary" @click="load">נסה שוב</button>
    </div>
    <div v-else-if="data === null" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <div v-for="n in 8" :key="n" class="skeleton h-36"></div>
    </div>
    <template v-else>
      <div class="page-header"><h1 class="page-title">{{ data.league.name }}</h1></div>
      <p v-if="empty" class="empty-state">אין קבוצות בליגה הזו עדיין.</p>
      <div v-else class="space-y-10 sm:space-y-14">
        <section v-if="data.onSite.length">
          <h2 v-if="data.notOnSite.length" class="section-title">קבוצות באתר</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="team in data.onSite" :key="team.id" :name="team.name" :logo-url="team.logo_url" :to="'/' + teamSlug(team)" />
          </div>
        </section>
        <section v-if="data.notOnSite.length">
          <h2 v-if="data.onSite.length" class="section-title">עוד בליגה</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TeamCard v-for="t in data.notOnSite" :key="t.ibasketball_team_url" :name="t.name" :logo-url="t.logo_url" />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
