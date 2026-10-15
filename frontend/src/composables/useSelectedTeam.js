import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const STORAGE_KEY = 'gush-ball:selected-team-id'

const selectedTeamId = ref(localStorage.getItem(STORAGE_KEY))
const teamsLoaded = ref(false)

watch(selectedTeamId, (id) => {
  if (id) localStorage.setItem(STORAGE_KEY, id)
  else localStorage.removeItem(STORAGE_KEY)
})

// Public URL slug, derived from name_en so it tracks admin edits (no DB column).
// ponytail: first match wins on duplicate name_en; add uniqueness when it actually happens.
export function teamSlug(team) {
  const slug = (team.name_en ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  return slug || String(team.id)
}

// The teams sharing `team`'s club (including itself); [] when the team has no club.
export function clubTeamsOf(teams, team) {
  if (!team?.club) return []
  return teams.filter((t) => t.club === team.club)
}

export function useSelectedTeam() {
  // Call once the real team list has loaded. A remembered team is one the visitor opened;
  // forget it if it no longer exists. Never invents a default, so first-time visitors can be told apart.
  function markTeamsLoaded(teams) {
    teamsLoaded.value = true
    if (!teams.some((t) => String(t.id) === selectedTeamId.value)) selectedTeamId.value = null
  }

  return { selectedTeamId, teamsLoaded, markTeamsLoaded }
}

// The URL slug picks the team on every route that has one (home, /:slug/schedule, /:slug/admin, …).
// An unknown slug or a team id is replaced by the canonical slug, keeping the page, query and hash.
export function useTeamFromRoute(teams) {
  const route = useRoute()
  const router = useRouter()
  watch([() => route.params.slug, () => route.name, teams], () => {
    if (!teams.value.length) return
    if (route.name !== 'home' && route.params.slug === undefined) return
    const slug = String(route.params.slug ?? '').toLowerCase()
    const match = teams.value.find((t) => teamSlug(t) === slug)
    if (match) {
      selectedTeamId.value = String(match.id)
      return
    }
    // /<team id> redirects to that team's canonical slug; slugs above always win over ids.
    const fallback = teams.value.find((t) => String(t.id) === slug)
      ?? teams.value.find((t) => String(t.id) === selectedTeamId.value)
      ?? teams.value[0]
    router.replace({
      name: route.name === 'home' ? 'team-home' : route.name,
      params: { ...route.params, slug: teamSlug(fallback) },
      query: route.query,
      hash: route.hash,
    })
  })
}
