import { describe, expect, it } from 'vitest'

import { matchesQuery, matchRank } from './search'

describe('matchesQuery', () => {
  it('matches empty queries, trimmed case-insensitive substrings, numbers, and skips null fields', () => {
    expect(matchesQuery('', ['x'])).toBe(true)
    expect(matchesQuery('   ', ['x'])).toBe(true)
    expect(matchesQuery(' MAC ', [null, 'Maccabi'])).toBe(true)
    expect(matchesQuery('zzz', [undefined, 'Maccabi'])).toBe(false)
    expect(matchesQuery('7', ['יוסי', 7])).toBe(true)
    expect(matchesQuery('8', ['יוסי', 7])).toBe(false)
  })
})

describe('matchRank', () => {
  it('ranks prefix, then team substring, then other-field substring', () => {
    expect(matchRank('', ['x'], [])).toBe(0)
    expect(matchRank('   ', ['x'], [])).toBe(0)
    expect(matchRank(' MAC', ['Maccabi'], [])).toBe(0)
    expect(matchRank('mac', [null, 'Maccabi'], [])).toBe(0)
    expect(matchRank('cab', ['Maccabi'], ['zzz'])).toBe(1)
    expect(matchRank('leag', ['Maccabi'], [undefined, 'Premier League'])).toBe(2)
    expect(matchRank('zzz', ['Maccabi'], ['League'])).toBe(null)
    expect(matchRank('abi', ['מכבי', 'Maccabi'], [])).toBe(1)
    expect(matchRank('mac', ['מכבי', 'Maccabi'], [])).toBe(0)
  })
})
