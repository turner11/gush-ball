<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import SearchInput from '../components/SearchInput.vue'
import TeamCard from '../components/TeamCard.vue'
import { useFavorites } from '../composables/useFavorites'
import { teamSlug, useSelectedTeam } from '../composables/useSelectedTeam'
import { apiFetch } from '../lib/api'
import { leagueKey } from '../lib/leagues'
import { matchesQuery, matchRank } from '../lib/search'
import LoadError from '../components/LoadError.vue'

const route = useRoute()
const router = useRouter()
const { selectedTeamId } = useSelectedTeam()
const teams = ref(null) // null = loading
const leagues = ref([])
const failed = ref(false)
const searchInput = ref(null)

// Mode and search live in the URL so Back from a league returns to the same list.
const showAll = computed({
  get: () => route.query.all === '1',
  set: (on) => router.replace({ query: { ...route.query, all: on ? '1' : undefined, q: undefined } }), // q is per-mode
})
const query = computed({
  get: () => String(route.query.q ?? ''),
  set: (q) => router.replace({ query: { ...route.query, q: q || undefined } }),
})

async function load() {
  failed.value = false
  teams.value = null
  try {
    ;[teams.value, leagues.value] = await Promise.all([apiFetch('/teams'), apiFetch('/leagues')])
  } catch {
    failed.value = true
  }
}
onMounted(load)

const teamsByLeague = computed(() => {
  const byKey = new Map()
  for (const t of teams.value ?? []) {
    const key = leagueKey(t.ibasketball_league_url)
    byKey.set(key, [...(byKey.get(key) ?? []), t])
  }
  return byKey
})
const { sortTeams, sortGroups } = useFavorites()
const leagueRows = computed(() =>
  sortGroups(
    leagues.value.map((league) => {
      const teams = teamsByLeague.value.get(leagueKey(league.url)) ?? []
      return { league, teams, count: teams.length }
    }),
    (row) => row.teams,
    (row) => row.league.name,
  ),
)
const ourLeagues = computed(() => leagueRows.value.filter((r) => r.count))
const otherTeams = computed(() => {
  const known = new Set(leagues.value.map((l) => leagueKey(l.url)))
  return sortTeams((teams.value ?? []).filter((t) => !known.has(leagueKey(t.ibasketball_league_url))))
})
const filteredRows = computed(() => leagueRows.value.filter((r) => matchesQuery(query.value, [r.league.name])))

// Default-mode team search: on-site teams match locally; ibasketball-only teams come from the backend (debounced).
const teamQuery = computed(() => (showAll.value ? '' : query.value.trim()))
const scraped = ref({ rows: [], loading: false, failed: false })
let debounce
async function searchScraped(q) {
  scraped.value = { rows: [], loading: true, failed: false }
  try {
    const rows = await apiFetch('/leagues/teams?q=' + encodeURIComponent(q))
    if (q === teamQuery.value) scraped.value = { rows, loading: false, failed: false }
  } catch {
    if (q === teamQuery.value) scraped.value = { rows: [], loading: false, failed: true }
  }
}
watch(
  teamQuery,
  (q) => {
    clearTimeout(debounce)
    if (q.length < 2) {
      scraped.value = { rows: [], loading: false, failed: false }
      return
    }
    scraped.value = { rows: [], loading: true, failed: false }
    debounce = setTimeout(() => searchScraped(q), 300)
  },
  { immediate: true },
)
const leagueNameByKey = computed(() => new Map(leagues.value.map((l) => [leagueKey(l.url), l.name])))
const teamResults = computed(() => {
  const q = teamQuery.value
  const site = sortTeams(teams.value ?? []).map((t) => ({
    key: 'site' + t.id,
    team: t,
    league: leagueNameByKey.value.get(leagueKey(t.ibasketball_league_url)),
    rank: matchRank(q, [t.name, t.name_en], []),
  }))
  const other = scraped.value.rows
    .filter((r) => r.team_id == null)
    .map((r) => ({ key: r.ibasketball_team_url, scraped: r, league: r.league.name, rank: matchRank(q, [r.name], []) }))
  return [...site, ...other].filter((r) => r.rank !== null).sort((a, b) => a.rank - b.rank)
})

const countLabel = (n) => (n === 1 ? 'קבוצה אחת באתר' : `${n} קבוצות באתר`)
const leagueTo = (league) => ({ name: 'league-teams', params: { leagueId: league.ibasketball_id } })

async function setAll(on) {
  showAll.value = on
  if (!on) return
  await nextTick()
  searchInput.value?.focus()
}

function clearSearch() {
  query.value = ''
  searchInput.value?.focus()
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">קבוצות</h1>
      <div v-if="leagues.length" class="segmented w-full sm:w-auto" role="group" aria-label="תצוגת ליגות">
        <button type="button" class="segmented-item flex-1 sm:flex-none" :aria-pressed="!showAll" @click="setAll(false)">הליגות שלנו</button>
        <button type="button" class="segmented-item flex-1 sm:flex-none" :aria-pressed="showAll" @click="setAll(true)">כל הליגות</button>
      </div>
    </div>

    <SearchInput v-if="teams !== null && !failed && !showAll && (teams.length || leagues.length)" id="team-search" ref="searchInput" v-model="query" label="חיפוש קבוצה" class="mb-6 w-full sm:w-80" />

    <LoadError v-if="failed" message="שגיאה בטעינת הליגות" @retry="load" />
    <div v-else-if="teams === null" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <div v-for="n in 6" :key="n" class="skeleton h-16"></div>
    </div>

    <template v-else-if="showAll && leagues.length">
      <SearchInput id="league-search" ref="searchInput" v-model="query" label="חיפוש ליגה" class="w-full sm:w-80" />
      <p class="mt-3 text-sm text-muted" aria-live="polite">{{ filteredRows.length }} ליגות</p>
      <div v-if="!filteredRows.length" class="empty-state mt-3">
        <p>אין ליגות התואמות לחיפוש "{{ query.trim() }}".</p>
        <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
      </div>
      <div v-else class="card mt-3 p-0">
        <ul class="divide-y divide-line">
          <li v-for="{ league, count } in filteredRows" :key="league.ibasketball_id">
            <RouterLink :to="leagueTo(league)" class="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-sunken">
              <span class="font-bold text-ink">{{ league.name }}</span>
              <span class="flex shrink-0 items-center gap-2">
                <span v-if="count" class="badge-muted">{{ countLabel(count) }}</span>
                <AppIcon name="chevron" class="rotate-90 text-muted" />
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </template>

    <template v-else-if="teamQuery">
      <p class="text-sm text-muted" aria-live="polite">{{ teamResults.length }} קבוצות</p>
      <div v-if="teamResults.length" class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <TeamCard
          v-for="r in teamResults"
          :key="r.key"
          :team-id="r.team?.id"
          :name="r.team?.name ?? r.scraped.name"
          :logo-url="r.team ? r.team.logo_url : r.scraped.logo_url"
          :to="r.team ? '/' + teamSlug(r.team) : `/teams/${r.scraped.league.ibasketball_id}`"
          :current="r.team ? String(r.team.id) === selectedTeamId : false"
        >
          <span v-if="r.league" class="line-clamp-1 text-sm text-muted">{{ r.league }}</span>
          <span v-if="r.scraped" class="badge-muted">לא באתר</span>
        </TeamCard>
      </div>
      <p v-else-if="scraped.loading" class="mt-3 text-sm text-muted" role="status">מחפש קבוצות נוספות…</p>
      <div v-else-if="!scraped.failed" class="empty-state mt-3">
        <p>אין קבוצות התואמות לחיפוש "{{ teamQuery }}".</p>
        <button type="button" class="btn-secondary mt-3" @click="clearSearch">נקה חיפוש</button>
      </div>
      <p v-if="scraped.loading && teamResults.length" class="mt-3 text-sm text-muted" role="status">מחפש קבוצות נוספות…</p>
      <LoadError v-if="scraped.failed" class="mt-3" message="לא הצלחנו לחפש קבוצות באתר האיגוד" @retry="searchScraped(teamQuery)" />
    </template>

    <p v-else-if="!teams.length && !leagues.length" class="empty-state">אין ליגות עדיין.</p>
    <div v-else-if="!ourLeagues.length && !otherTeams.length" class="empty-state">
      <p>עדיין אין קבוצות באתר.</p>
      <button type="button" class="btn-secondary mt-3" @click="setAll(true)">לכל הליגות</button>
    </div>
    <div v-else class="space-y-10 sm:space-y-14">
      <section v-if="ourLeagues.length">
        <h2 class="section-title">ליגות</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink v-for="{ league, count } in ourLeagues" :key="league.ibasketball_id" :to="leagueTo(league)" class="card flex min-h-11 items-center gap-3 transition-colors hover:border-team">
            <span class="line-clamp-2 flex-1 font-bold text-ink">{{ league.name }}</span>
            <span class="badge-muted shrink-0">{{ countLabel(count) }}</span>
            <AppIcon name="chevron" class="shrink-0 rotate-90 text-muted" />
          </RouterLink>
        </div>
      </section>
      <section v-if="otherTeams.length">
        <h2 v-if="ourLeagues.length" class="section-title">קבוצות נוספות</h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <TeamCard v-for="team in otherTeams" :key="team.id" :team-id="team.id" :name="team.name" :logo-url="team.logo_url" :to="'/' + teamSlug(team)" :current="String(team.id) === selectedTeamId" />
        </div>
      </section>
    </div>
  </div>
</template>
