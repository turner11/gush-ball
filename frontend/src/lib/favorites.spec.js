import { describe, expect, it } from 'vitest'

import { byAffinity } from './favorites'

const ids = (list) => list.map((t) => t.id)

describe('byAffinity', () => {
  it('ranks member, then admin, then favourite, then name, without mutating', () => {
    const user = {
      memberships: [{ team_id: 1, role: 'member' }, { team_id: 2, role: 'admin' }, { team_id: 5, role: 'pending' }],
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

  it('a club admin grant does not lift club leagues above a liked league', () => {
    const leagues = [
      { n: 'א', t: [1, 2] },
      { n: 'ב', t: [5] },
    ]
    const teamsOf = (l) => l.t.map((id) => ({ id, club: id === 5 ? undefined : 'X' }))
    const user = { memberships: [{ club: 'X', role: 'admin' }], favorite_team_ids: [5] }
    expect(byAffinity(leagues, user, teamsOf, (l) => l.n).map((l) => l.n)).toEqual(['ב', 'א'])
  })

  it('a linked player team is associated; a club member grant alone is not', () => {
    const teams = [{ id: 1, name: 'ב', club: 'X' }, { id: 2, name: 'א', club: 'X' }, { id: 3, name: 'ג' }]
    const user = { memberships: [{ club: 'X', role: 'member' }], player_team_ids: [3] }
    expect(ids(byAffinity(teams, user))).toEqual([3, 2, 1])
  })

  it('null user sorts alphabetically', () => {
    expect(ids(byAffinity([{ id: 1, name: 'ת' }, { id: 2, name: 'א' }], null))).toEqual([2, 1])
  })
})
