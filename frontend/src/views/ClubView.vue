<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { useFavorites } from '../composables/useFavorites'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { splitGames } from '../lib/games'
import { clubJsonLd, pageTitle, setJsonLd, setMeta } from '../lib/head'
import { leagueKey } from '../lib/leagues'
import { matchRank } from '../lib/search'
import SearchInput from '../components/SearchInput.vue'
import GameRow from '../components/GameRow.vue'
import TeamCard from '../components/TeamCard.vue'

// "This week at the club": the games of every team in this club from the last 7 to the next 7 days (#326).
function day(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset) // calendar days, so DST can't shift the date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const route = useRoute()
const router = useRouter()
const { selectedTeamId } = useSelectedTeam()
const loading = ref(true)
const error = ref(false)
const games = ref([])
const teams = ref([])
const leagues = ref([])
const searchInput = ref(null)
const club = ref(null) // null = not found (once loaded)

const { sortTeams } = useFavorites()
const clubTeams = computed(() => (club.value ? teams.value.filter((t) => t.club === club.value.name) : []))
// The search lives in the URL so Back from a team page restores the filter.
const query = computed({
  get: () => String(route.query.q ?? ''),
  set: (q) => router.replace({ query: { ...route.query, q: q || undefined } }),
})
const leagueNameByKey = computed(() => new Map(leagues.value.map((l) => [leagueKey(l.url), l.name])))
// Grid and games only: SEO text uses clubTeams, so it must not depend on the viewer or the query.
// Sorted by match tier; the sort is stable, so favourites order survives inside each tier.
const shownTeams = computed(() =>
  sortTeams(clubTeams.value)
    .map((t) => ({ t, rank: matchRank(query.value, [t.name, t.name_en], [leagueNameByKey.value.get(leagueKey(t.ibasketball_league_url))]) }))
    .filter(({ rank }) => rank !== null)
    .sort((a, b) => a.rank - b.rank)
    .map(({ t }) => t),
)

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}

const groups = computed(() => {
  // ponytail: /games returns every club's games, so filter client-side; add a `club` query param if the payload grows.
  const clubIds = new Set(shownTeams.value.map((t) => t.id))
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
    const [clubList, teamList, gameList, leagueList] = await Promise.all([
      apiFetch('/clubs'),
      apiFetch('/teams'),
      apiFetch(`/games?from=${day(-7)}&to=${day(7)}`),
      apiFetch('/leagues').catch(() => []), // league matching is a bonus: don't blank the page without it
    ])
    if (slug !== route.params.clubSlug) return // navigated away mid-load: don't clobber the new page's head
    teams.value = teamList
    games.value = gameList
    leagues.value = leagueList
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
      <div v-if="clubTeams.length > 1">
        <SearchInput id="club-team-search" ref="searchInput" v-model="query" label="חיפוש קבוצה או ליגה" class="w-full sm:w-80" />
        <p class="mt-2 text-sm text-muted" aria-live="polite">{{ shownTeams.length === 1 ? 'קבוצה אחת' : `${shownTeams.length} קבוצות` }}</p>
      </div>
      <section class="space-y-3">
        <h2 class="section-title">הקבוצות</h2>
        <p v-if="!clubTeams.length" class="empty-state">אין קבוצות במועדון.</p>
        <div v-else-if="!shownTeams.length" class="empty-state">
          <p>אין קבוצות התואמות לחיפוש "{{ query.trim() }}".</p>
          <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
        </div>
        <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <TeamCard v-for="t in shownTeams" :key="t.id" :team-id="t.id" :name="t.name" :logo-url="t.logo_url" :to="'/' + teamSlug(t)" :current="String(t.id) === selectedTeamId" />
        </div>
      </section>
      <section class="space-y-3">
        <h2 class="section-title">השבוע במועדון</h2>
        <p v-if="!groups.length" class="empty-state">{{ query.trim() ? 'אין משחקים השבוע לקבוצות התואמות.' : 'אין משחקים במועדון השבוע.' }}</p>
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
