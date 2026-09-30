import { describe, expect, it } from 'vitest'

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
