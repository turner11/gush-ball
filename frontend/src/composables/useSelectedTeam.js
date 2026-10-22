import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const STORAGE_KEY = 'gush-ball:selected-team-id'

const selectedTeamId = ref(localStorage.getItem(STORAGE_KEY))
const teamsLoaded = ref(false)
// DefaultLayout's public team list. A public page's save patches its row so the header follows (#471).
const teams = ref([])

watch(selectedTeamId, (id) => {
  if (id) localStorage.setItem(STORAGE_KEY, id)
  else localStorage.removeItem(STORAGE_KEY)
})

// Public URL slug of a team or club, derived from name_en so it tracks admin edits (no DB column).
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
  // Call once the real team list has loaded. A remembered team is one the visitor opened;
  // forget it if it no longer exists. Never invents a default, so first-time visitors can be told apart.
  function markTeamsLoaded(list) {
    teamsLoaded.value = true
    if (!list.some((t) => String(t.id) === selectedTeamId.value)) selectedTeamId.value = null
  }

  return { selectedTeamId, teamsLoaded, teams, markTeamsLoaded }
}

// The URL slug picks the team on every route that has one (home, /:slug/schedule, /:slug/admin, …).
// A team id is replaced by the canonical slug, keeping the page, query and hash. Any other unknown slug resolves to
// the remembered team, else /teams; it never picks a team the visitor didn't choose (#358). The admin layout passes
// fallbackToFirst because its list is only the admin's own teams.
export function useTeamFromRoute(teams, { fallbackToFirst = false } = {}) {
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
      ?? (fallbackToFirst ? teams.value[0] : undefined)
    if (!fallback) {
      router.replace({ name: 'teams' })
      return
    }
    router.replace({
      name: route.name === 'home' ? 'team-home' : route.name,
      params: { ...route.params, slug: teamSlug(fallback) },
      query: route.query,
      hash: route.hash,
    })
  })
}
