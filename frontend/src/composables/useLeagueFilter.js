import { computed, ref, toValue, watch } from 'vue'

import { apiFetch } from '../lib/api'
import { useFavorites } from './useFavorites'

// TODO(#416): import from lib/leagues.js
// The league slug: last non-empty path segment, so a trailing slash does not matter.
function leagueKey(url) {
  const segment = (url ?? '').split('/').filter(Boolean).pop()
  return segment ? decodeURIComponent(segment).toLowerCase() : null
}

// League dropdown state for a list of teams. `leagueId` '' = all leagues. /leagues is secondary data:
// if it fails there are no options, so the dropdown just hides.
export function useLeagueFilter(teams) {
  const { sortGroups } = useFavorites()
  const leagues = ref([])
  // Fetched once, when there are first teams to filter.
  let requested = false
  watch(
    () => toValue(teams).length > 0,
    (hasTeams) => {
      if (!hasTeams || requested) return
      requested = true
      apiFetch('/leagues').then((ls) => (leagues.value = ls), () => {})
    },
    { immediate: true },
  )

  const leagueId = ref('')
  const teamsOf = (league) => toValue(teams).filter((t) => leagueKey(t.ibasketball_league_url) === leagueKey(league.url))

  const leagueOptions = computed(() =>
    sortGroups(leagues.value.filter((l) => teamsOf(l).length), teamsOf, (l) => l.name).map((l) => ({
      value: String(l.ibasketball_id),
      label: l.name,
    })),
  )
  const teamsInLeague = computed(() => {
    const league = leagues.value.find((l) => String(l.ibasketball_id) === leagueId.value)
    return league ? teamsOf(league) : toValue(teams)
  })

  return { leagueId, leagueOptions, teamsInLeague }
}
