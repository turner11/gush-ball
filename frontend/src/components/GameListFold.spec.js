import { mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GameListFold from './GameListFold.vue'

const game = (n) => ({ id: n, is_home: true, status: 'final', team_score: 80, opponent_score: 70, scheduled_at: null, opponent: { name: `יריב ${n}` } })
const GAMES = [1, 2, 3, 4, 5].map(game)
const stubs = { GameLocationLinks: true, GameStatsLink: { template: '<i data-stats />' }, RouterLink: RouterLinkStub }
const mountFold = (props = {}, slots = {}) =>
  mount(GameListFold, { props: { games: GAMES, limit: 3, listId: 'fold', allLabel: 'כל התוצאות', teamOf: () => null, ...props }, slots, global: { stubs } })
const rows = (w) => w.findAll('#fold > li')

describe('GameListFold', () => {
  it('shows the first `limit` rows plus a faded, inert peek row and a "show all" toggle', () => {
    const w = mountFold()
    expect(rows(w)).toHaveLength(4)
    expect(rows(w)[2].attributes('inert')).toBeUndefined()
    expect(rows(w)[3].attributes('inert')).toBeDefined()
    expect(rows(w)[3].attributes('aria-hidden')).toBe('true')
    expect(w.text()).not.toContain('יריב 5')
    const toggle = w.get('button')
    expect(toggle.text()).toBe('כל התוצאות (5)')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('fold')
  })

  it('expanding shows every row and the toggle folds them again', async () => {
    const w = mountFold()
    await w.get('button').trigger('click')
    expect(rows(w)).toHaveLength(5)
    expect(w.find('[inert]').exists()).toBe(false)
    expect(w.get('button').text()).toBe('הצגת פחות')
    expect(w.get('button').attributes('aria-expanded')).toBe('true')
    await w.get('button').trigger('click')
    expect(rows(w)).toHaveLength(4)
    expect(w.emitted('update:expanded')).toEqual([[true], [false]])
  })

  it('no peek and no toggle when games do not exceed the limit', () => {
    const w = mountFold({ games: GAMES.slice(0, 3) })
    expect(rows(w)).toHaveLength(3)
    expect(w.find('[inert]').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
  })

  it('forwards the actions slot only when given, and renders the after slot per shown row', () => {
    const plain = mountFold({}, { after: '<li data-after />' })
    expect(plain.findAll('[data-stats]')).toHaveLength(4) // 3 shown rows + the peek
    expect(plain.findAll('[data-after]')).toHaveLength(3)
    const withActions = mountFold({}, { actions: '<b data-action />' })
    expect(withActions.findAll('[data-action]')).toHaveLength(3)
    expect(withActions.find('[data-stats]').exists()).toBe(false)
  })
})
