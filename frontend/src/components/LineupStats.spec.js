import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LineupStats from './LineupStats.vue'

const PLAYERS = [{ id: 1, name: 'יוסי כהן', jersey_number: 7, images: [] }]
const LINEUP = {
  players: [7, 9],
  minutes: 12.4,
  score_diff: 5,
  offense_diff: 20,
  defence_diff: 15,
  score_pm: 0.4,
  offense_pm: 1.6,
  defence_pm: 1.2,
}

function mockFetch(body) {
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body }))
}

const mountIt = () => mount(LineupStats, { props: { teamId: 1, players: PLAYERS } })
const button = (w, text) => w.findAll('button').find((b) => b.text() === text)
const urls = () => global.fetch.mock.calls.map(([u]) => u)

describe('LineupStats', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders lineups with player names by jersey, #N fallback and the +/-', async () => {
    mockFetch([LINEUP])
    const wrapper = mountIt()
    await flushPromises()

    expect(urls()).toContain('/api/teams/1/lineups?size=5&sort=top')
    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('#9')
    expect(wrapper.text()).toContain('+5')
  })

  it('refetches when size or sort change and tracks aria-pressed', async () => {
    mockFetch([LINEUP])
    const wrapper = mountIt()
    await flushPromises()

    await button(wrapper, '2').trigger('click')
    await flushPromises()
    expect(urls()).toContain('/api/teams/1/lineups?size=2&sort=top')
    expect(button(wrapper, '2').attributes('aria-pressed')).toBe('true')

    await button(wrapper, 'הגנה').trigger('click')
    await flushPromises()
    expect(urls()).toContain('/api/teams/1/lineups?size=2&sort=defense')
    expect(button(wrapper, 'הגנה').attributes('aria-pressed')).toBe('true')
    expect(button(wrapper, 'מובילים').attributes('aria-pressed')).toBe('false')
  })

  it('shows the empty state', async () => {
    mockFetch([])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.text()).toContain('אין נתוני חמישיות עדיין.')
  })
})
