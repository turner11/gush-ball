import { ref, watch } from 'vue'

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
