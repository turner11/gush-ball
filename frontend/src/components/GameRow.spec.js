import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GameRow from './GameRow.vue'

const game = { is_home: false, status: 'played', team_score: 82, opponent_score: 75, scheduled_at: null, opponent: { name: 'מכבי' } }
const stubs = { GameLocationLinks: true, GameStatsLink: true }

describe('GameRow score', () => {
  it('mobile score is ours first, desktop stays home first', () => {
    const w = mount(GameRow, { props: { game }, global: { stubs } })
    expect(w.get('[data-score=mobile]').text()).toBe('82 : 75')
    expect(w.get('[data-score=desktop]').text()).toBe('75 : 82')
  })
})
