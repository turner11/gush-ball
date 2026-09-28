import { ref, watch } from 'vue'

const STORAGE_KEY = 'gush-ball:selected-team-id'

const selectedTeamId = ref(localStorage.getItem(STORAGE_KEY))

watch(selectedTeamId, (id) => {
  if (id) localStorage.setItem(STORAGE_KEY, id)
})

export function useSelectedTeam() {
  // Call once the real team list has loaded, so first-time visitors land on
  // the first team in the DB instead of an empty selection.
  function ensureDefault(teams) {
    if (!selectedTeamId.value && teams.length > 0) {
      selectedTeamId.value = String(teams[0].id)
    }
  }

  return { selectedTeamId, ensureDefault }
}
