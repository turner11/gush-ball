import { nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import { clubTeamsOf, teamSlug, useSelectedTeam } from './useSelectedTeam'

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

describe('clubTeamsOf', () => {
  const a = { id: 1, club: 'מכבי' }
  const b = { id: 2, club: 'מכבי' }
  const c = { id: 3, club: 'הפועל' }
  const d = { id: 4, club: null }

  it('returns club-mates including the team itself', () => {
    expect(clubTeamsOf([a, b, c, d], a)).toEqual([a, b])
  })
  it('returns a team alone in its club as one', () => {
    expect(clubTeamsOf([a, b, c], c)).toEqual([c])
  })
  it.each([[d], [undefined]])('returns [] without a club (%j)', (team) => {
    expect(clubTeamsOf([a, b, c, d], team)).toEqual([])
  })
})
