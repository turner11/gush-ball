<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useFavorites } from '../composables/useFavorites'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { splitGames } from '../lib/games'
import { clubJsonLd, pageTitle, setJsonLd, setMeta } from '../lib/head'
import GameRow from '../components/GameRow.vue'
import TeamCard from '../components/TeamCard.vue'

// "This week at the club": the games of every team in this club from the last 7 to the next 7 days (#326).
function day(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset) // calendar days, so DST can't shift the date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const route = useRoute()
const { selectedTeamId } = useSelectedTeam()
const loading = ref(true)
const error = ref(false)
const games = ref([])
const teams = ref([])
const club = ref(null) // null = not found (once loaded)

const { sortTeams } = useFavorites()
const clubTeams = computed(() => (club.value ? teams.value.filter((t) => t.club === club.value.name) : []))
const shownTeams = computed(() => sortTeams(clubTeams.value)) // grid only: SEO text must not depend on the viewer

const groups = computed(() => {
  // ponytail: /games returns every club's games, so filter client-side; add a `club` query param if the payload grows.
  const clubIds = new Set(clubTeams.value.map((t) => t.id))
  const { upcoming, past } = splitGames(games.value.filter((g) => clubIds.has(g.team_id)))
  return [
    { title: 'משחקים קרובים', games: upcoming },
    { title: 'תוצאות אחרונות', games: past },
  ].filter((g) => g.games.length)
})
const teamOf = (g) => teams.value.find((t) => t.id === g.team_id) ?? null

async function load() {
  const slug = route.params.clubSlug
  loading.value = true
  error.value = false
  try {
    const [clubList, teamList, gameList] = await Promise.all([apiFetch('/clubs'), apiFetch('/teams'), apiFetch(`/games?from=${day(-7)}&to=${day(7)}`)])
    if (slug !== route.params.clubSlug) return // navigated away mid-load: don't clobber the new page's head
    teams.value = teamList
    games.value = gameList
    club.value = clubList.find((c) => teamSlug(c) === slug) ?? null
    setHead()
  } catch {
    if (slug === route.params.clubSlug) error.value = true
  } finally {
    if (slug === route.params.clubSlug) loading.value = false
  }
}

function setHead() {
  const c = club.value
  document.title = c ? pageTitle(c.name, c.name_en) : pageTitle('מועדון')
  // ponytail: mirrors seo.py _page_tags (clubs branch); change both
  const names = clubTeams.value.map((t) => t.name).join(', ')
  setMeta('description', c && (names ? `הקבוצות של ${c.name}: ${names}.` : `מועדון ${c.name}.`))
  setJsonLd(c && clubJsonLd(c, location.origin + route.path, clubTeams.value.map((t) => ({ name: t.name, url: location.origin + '/' + teamSlug(t) }))))
}

watch(() => route.params.clubSlug, load, { immediate: true })
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="space-y-3" aria-busy="true">
      <div class="skeleton h-12" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="n in 4" :key="n" class="skeleton h-32" />
      </div>
      <div class="skeleton h-16" />
      <div class="skeleton h-16" />
    </div>
    <div v-else-if="error" class="space-y-3">
      <p class="error-text" role="alert">שגיאה בטעינת המועדון</p>
      <button type="button" class="btn-secondary" @click="load">נסו שוב</button>
    </div>
    <div v-else-if="!club" class="space-y-3">
      <p class="empty-state">המועדון לא נמצא.</p>
      <RouterLink :to="{ name: 'teams' }" class="btn-secondary">לכל הקבוצות</RouterLink>
    </div>
    <template v-else>
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ club.name }}</h1>
          <p v-if="club.name_en" class="mt-1 text-lg font-semibold text-muted"><bdi lang="en">{{ club.name_en }}</bdi></p>
        </div>
        <a v-if="club.ibasketball_url" :href="club.ibasketball_url" target="_blank" rel="noopener noreferrer" class="section-link">המועדון ב-ibasketball</a>
      </div>
      <section class="space-y-3">
        <h2 class="section-title">הקבוצות</h2>
        <p v-if="!clubTeams.length" class="empty-state">אין קבוצות במועדון.</p>
        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <TeamCard v-for="t in shownTeams" :key="t.id" :team-id="t.id" :name="t.name" :logo-url="t.logo_url" :to="'/' + teamSlug(t)" :current="String(t.id) === selectedTeamId" />
        </div>
      </section>
      <section class="space-y-3">
        <h2 class="section-title">השבוע במועדון</h2>
        <p v-if="!groups.length" class="empty-state">אין משחקים במועדון השבוע.</p>
        <div v-for="group in groups" :key="group.title" class="space-y-2">
          <h3 class="eyebrow">{{ group.title }}</h3>
          <ol class="card divide-y divide-line overflow-hidden p-0">
            <GameRow v-for="g in group.games" :key="g.id" :game="g" :team="teamOf(g)" show-team />
          </ol>
        </div>
      </section>
    </template>
  </section>
</template>
