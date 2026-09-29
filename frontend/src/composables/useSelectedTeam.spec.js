import { describe, expect, it } from 'vitest'

import { teamSlug } from './useSelectedTeam'

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
