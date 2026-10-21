import { describe, expect, it } from 'vitest'

import { byRosterOrder } from './players'

describe('byRosterOrder', () => {
  it('sorts by number, then name case-insensitively, unnumbered last', () => {
    const players = [
      { id: 1, name: 'b', jersey_number: 7 },
      { id: 2, name: 'Zed', jersey_number: null },
      { id: 3, name: 'x', jersey_number: 3 },
      { id: 4, name: 'A', jersey_number: 7 },
      { id: 5, name: 'alpha' },
    ]
    expect([...players].sort(byRosterOrder).map((p) => p.name)).toEqual(['x', 'A', 'b', 'alpha', 'Zed'])
  })
})
