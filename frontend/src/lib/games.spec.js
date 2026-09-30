import { describe, expect, it } from 'vitest'

import { result } from './games'

describe('result', () => {
  it('returns W, L or null', () => {
    expect(result({ team_score: 80, opponent_score: 70 })).toBe('W')
    expect(result({ team_score: 70, opponent_score: 80 })).toBe('L')
    expect(result({ team_score: null, opponent_score: 80 })).toBeNull()
    expect(result({ team_score: 80, opponent_score: null })).toBeNull()
    expect(result({ team_score: 70, opponent_score: 70 })).toBeNull()
  })
})
