import { describe, expect, it } from 'vitest'

import { byFavoriteCount, favoritesFirst } from './favorites'

describe('favoritesFirst', () => {
  it('keeps existing order within favourites and non-favourites, without mutating', () => {
    const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const copy = [...teams]
    expect(favoritesFirst(teams, new Set([3, 1])).map((t) => t.id)).toEqual([1, 3, 2, 4])
    expect(teams).toEqual(copy)
  })
})

describe('byFavoriteCount', () => {
  it('sorts by favourite count desc, ties keep existing order', () => {
    const items = [{ n: 'a', t: [1] }, { n: 'b', t: [2, 3] }, { n: 'c', t: [9] }, { n: 'd', t: [3, 1] }]
    const sorted = byFavoriteCount(items, (i) => i.t.map((id) => ({ id })), new Set([1, 3]))
    expect(sorted.map((i) => i.n)).toEqual(['d', 'a', 'b', 'c'])
  })
})
