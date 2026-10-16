import { describe, expect, it } from 'vitest'

import { byAffinity } from './favorites'

const ids = (list) => list.map((t) => t.id)

describe('byAffinity', () => {
  it('ranks member, then admin, then favourite, then name, without mutating', () => {
    const user = {
      memberships: [{ team_id: 1, role: 'member' }, { club: 'X', role: 'admin' }, { team_id: 5, role: 'pending' }],
      favorite_team_ids: [4],
    }
    const teams = [
      { id: 5, name: 'ת' },
      { id: 3, name: 'ב' },
      { id: 4, name: 'ש' },
      { id: 2, name: 'ש', club: 'X' },
      { id: 1, name: 'ת' },
      { id: 6, name: 'א' },
    ]
    const copy = [...teams]
    expect(ids(byAffinity(teams, user))).toEqual([1, 2, 4, 6, 3, 5])
    expect(teams).toEqual(copy)
  })

  it('groups count their teams and tie-break by name', () => {
    const user = { memberships: [{ team_id: 1, role: 'member' }], favorite_team_ids: [2, 3, 4] }
    const leagues = [
      { n: 'ב', t: [2, 3] },
      { n: 'ג', t: [9] },
      { n: 'א', t: [9] },
      { n: 'ת', t: [1] },
      { n: 'ד', t: [4] },
    ]
    const sorted = byAffinity(leagues, user, (l) => l.t.map((id) => ({ id })), (l) => l.n)
    expect(sorted.map((l) => l.n)).toEqual(['ת', 'ב', 'ד', 'א', 'ג'])
  })

  it('null user sorts alphabetically', () => {
    expect(ids(byAffinity([{ id: 1, name: 'ת' }, { id: 2, name: 'א' }], null))).toEqual([2, 1])
  })
})
