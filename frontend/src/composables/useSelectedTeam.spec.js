import { describe, expect, it } from 'vitest'

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

describe('ensureDefault', () => {
  it('replaces a selected id that is not in the list', () => {
    const { selectedTeamId, ensureDefault } = useSelectedTeam()
    selectedTeamId.value = '99'
    ensureDefault([{ id: 2 }])
    expect(selectedTeamId.value).toBe('2')
  })

  it('keeps a valid selection', () => {
    const { selectedTeamId, ensureDefault } = useSelectedTeam()
    selectedTeamId.value = '3'
    ensureDefault([{ id: 2 }, { id: 3 }])
    expect(selectedTeamId.value).toBe('3')
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
