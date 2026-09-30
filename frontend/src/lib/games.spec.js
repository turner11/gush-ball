import { describe, expect, it } from 'vitest'

import { homeFirst, played, result } from './games'

describe('played', () => {
  it('needs both scores', () => {
    expect(played({ team_score: 0, opponent_score: 0 })).toBe(true)
    expect(played({ team_score: 80, opponent_score: null })).toBe(false)
    expect(played({ team_score: null, opponent_score: null })).toBe(false)
  })
})

describe('homeFirst', () => {
  it('puts the home side first', () => {
    expect(homeFirst({ is_home: true }, 'us', 'them')).toEqual(['us', 'them'])
    expect(homeFirst({ is_home: false }, 'us', 'them')).toEqual(['them', 'us'])
  })
})

describe('result', () => {
  it('returns W, L or null', () => {
    expect(result({ team_score: 80, opponent_score: 70 })).toBe('W')
    expect(result({ team_score: 70, opponent_score: 80 })).toBe('L')
    expect(result({ team_score: null, opponent_score: 80 })).toBeNull()
    expect(result({ team_score: 80, opponent_score: null })).toBeNull()
    expect(result({ team_score: 70, opponent_score: 70 })).toBeNull()
  })
})
