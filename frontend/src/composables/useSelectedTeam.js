import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const STORAGE_KEY = 'gush-ball:selected-team-id'

const selectedTeamId = ref(localStorage.getItem(STORAGE_KEY))
const teamsLoaded = ref(false)

watch(selectedTeamId, (id) => {
  if (id) localStorage.setItem(STORAGE_KEY, id)
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

export function useSelectedTeam() {
  // Call once the real team list has loaded, so first-time visitors land on
  // the first team in the DB instead of an empty selection.
  function ensureDefault(teams) {
    teamsLoaded.value = true
    if (teams.length > 0 && !teams.some((t) => String(t.id) === selectedTeamId.value)) {
      selectedTeamId.value = String(teams[0].id)
    }
  }

  return { selectedTeamId, teamsLoaded, ensureDefault }
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
