import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GameRow from './GameRow.vue'

const game = { is_home: false, status: 'played', team_score: 82, opponent_score: 75, scheduled_at: null, opponent: { name: 'מכבי' } }
const stubs = { GameLocationLinks: true, GameStatsLink: true, RouterLink: RouterLinkStub }

describe('GameRow score', () => {
  it('mobile score is ours first, desktop stays home first', () => {
    const w = mount(GameRow, { props: { game }, global: { stubs } })
    expect(w.get('[data-score=mobile]').text()).toBe('82 : 75')
    expect(w.get('[data-score=desktop]').text()).toBe('75 : 82')
  })
})

describe('GameRow game page link', () => {
  it('links to the game page when the team is known', () => {
    const w = mount(GameRow, { props: { game: { ...game, id: 7 }, team: { id: 1, name_en: 'Gush U14' } }, global: { stubs } })
    const link = w.findAllComponents(RouterLinkStub).find((l) => l.text() === 'פרטי המשחק')
    expect(link.props('to')).toEqual({ name: 'game', params: { slug: 'gush_u14', id: 7 } })
  })
})

describe('GameRow showTeam', () => {
  it('show-team labels the row with our team and drops the stats link', () => {
    const props = { game: { ...game, id: 7 }, team: { id: 1, name: 'קבוצה א', name_en: 'a' } }
    const plain = mount(GameRow, { props, global: { stubs } })
    expect(plain.findComponent({ name: 'GameStatsLink' }).exists()).toBe(true)
    const w = mount(GameRow, { props: { ...props, showTeam: true }, global: { stubs } })
    expect(w.find('p.text-xs').text()).toBe('קבוצה א')
    expect(w.findComponent({ name: 'GameStatsLink' }).exists()).toBe(false)
  })
})

describe('GameRow edge', () => {
  it('colours only the start edge, so divide-line still draws the divider', () => {
    const cases = [
      [game, 'border-s-win', 'border-win'],
      [{ ...game, team_score: 60 }, 'border-s-loss', 'border-loss'],
      [{ ...game, status: 'scheduled', team_score: null, opponent_score: null }, 'border-s-transparent', 'border-transparent'],
    ]
    for (const [g, start, bare] of cases) {
      const classes = mount(GameRow, { props: { game: g }, global: { stubs } }).get('li').classes()
      expect(classes).toContain(start)
      expect(classes).not.toContain(bare)
    }
  })
})
