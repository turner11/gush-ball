import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import { teamSlug, useSelectedTeam } from './useSelectedTeam'

describe('teamSlug', () => {
  it.each([
    [{ id: 1, name_en: 'Elizur' }, 'elizur'],
    [{ id: 1, name_en: 'Elizur Gush  Etzion!' }, 'elizur_gush_etzion'],
    [{ id: 1, name_en: "Ha'Poel" }, 'hapoel'],
    [{ id: 3, name_en: null }, '3'],
    [{ id: 4, name_en: '!!!' }, '4'],
  ])('%j -> %s', (team, slug) => {
    expect(teamSlug(team)).toBe(slug)
  })
})

describe('markTeamsLoaded', () => {
  beforeEach(() => localStorage.clear())

  it('forgets a selected id that is not in the list', async () => {
    const { selectedTeamId, markTeamsLoaded } = useSelectedTeam()
    selectedTeamId.value = '99'
    await nextTick()
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('99')
    markTeamsLoaded([{ id: 2 }])
    await nextTick()
    expect(selectedTeamId.value).toBeNull()
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBeNull()
  })

  it('keeps a valid selection', () => {
    const { selectedTeamId, markTeamsLoaded } = useSelectedTeam()
    selectedTeamId.value = '3'
    markTeamsLoaded([{ id: 2 }, { id: 3 }])
    expect(selectedTeamId.value).toBe('3')
  })

  it('never picks a team when nothing is selected', () => {
    const { selectedTeamId, markTeamsLoaded } = useSelectedTeam()
    selectedTeamId.value = null
    markTeamsLoaded([{ id: 2 }])
    expect(selectedTeamId.value).toBeNull()
  })
})
