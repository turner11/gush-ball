import { describe, expect, it } from 'vitest'

import { matchesQuery } from './search'

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
