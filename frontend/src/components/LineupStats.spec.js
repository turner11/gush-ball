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

    expect(urls()).toContain('/api/teams/1/lineups?size=5')
    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('#9')
    expect(wrapper.text()).toContain('+5')
  })

  it('refetches on size change only; sort clicks re-sort without fetching and track aria-pressed', async () => {
    mockFetch([LINEUP])
    const wrapper = mountIt()
    await flushPromises()

    await button(wrapper, '2').trigger('click')
    await flushPromises()
    expect(urls()).toContain('/api/teams/1/lineups?size=2')
    expect(button(wrapper, '2').attributes('aria-pressed')).toBe('true')

    const calls = global.fetch.mock.calls.length
    await button(wrapper, 'הגנה').trigger('click')
    await flushPromises()
    expect(global.fetch.mock.calls.length).toBe(calls)
    expect(button(wrapper, 'הגנה').attributes('aria-pressed')).toBe('true')
    expect(button(wrapper, 'מובילים').attributes('aria-pressed')).toBe('false')
  })

  it('shows minutes as mm:ss', async () => {
    mockFetch([LINEUP])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.text()).toContain('12:24')
  })

  it('hides lineups under 01:00 by default; הכל shows them with no extra fetch', async () => {
    mockFetch([LINEUP, { ...LINEUP, players: [1, 2], minutes: 0.42 }])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.findAll('li.card')).toHaveLength(1)

    await button(wrapper, 'הכל').trigger('click')
    expect(wrapper.findAll('li.card')).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('a stint of 0.99999 min passes the 01:00 filter', async () => {
    mockFetch([{ ...LINEUP, minutes: 0.99999 }])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.findAll('li.card')).toHaveLength(1)
  })

  it('filtered-empty state offers showing all', async () => {
    mockFetch([{ ...LINEUP, minutes: 0.42 }])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.text()).toContain('אין הרכבים ששיחקו לפחות 01:00')
    expect(wrapper.findAll('li.card')).toHaveLength(0)

    await button(wrapper, 'הצגת כל ההרכבים').trigger('click')
    expect(wrapper.findAll('li.card')).toHaveLength(1)
  })

  it('sorts by minutes and hides the ערך group', async () => {
    mockFetch([
      { ...LINEUP, players: [1, 2], minutes: 3 },
      { ...LINEUP, players: [3, 4], minutes: 9 },
    ])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.find('[aria-label="ערך"]').exists()).toBe(true)

    await button(wrapper, 'דקות').trigger('click')
    expect(wrapper.findAll('li.card')[0].text()).toContain('09:00')
    expect(wrapper.find('[aria-label="ערך"]').exists()).toBe(false)
  })

  it('per minute by default, total on toggle; defense sorts ascending', async () => {
    const A = { ...LINEUP, players: [1, 2], score_pm: 5, score_diff: 2, defence_pm: 3, defence_diff: 30 }
    const B = { ...LINEUP, players: [3, 4], score_pm: 1, score_diff: 9, defence_pm: 4, defence_diff: 10 }
    mockFetch([A, B])
    const wrapper = mountIt()
    await flushPromises()
    const first = () => wrapper.findAll('li.card')[0].text()
    expect(first()).toContain('#1')
    expect(first()).toContain('+2')

    await button(wrapper, 'סה״כ').trigger('click')
    expect(first()).toContain('+9')

    await button(wrapper, 'הגנה').trigger('click')
    expect(first()).toContain('+9') // defence_diff 10 < 30, ascending

    await button(wrapper, 'לדקה').trigger('click')
    expect(first()).toContain('+2') // defence_pm 3 < 4
  })

  it('shows the empty state', async () => {
    mockFetch([])
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.text()).toContain('אין נתוני חמישיות עדיין.')
  })

  it('passes gameId through and shows the per-game empty state', async () => {
    mockFetch([])
    const wrapper = mount(LineupStats, { props: { teamId: 1, players: PLAYERS, gameId: 3 } })
    await flushPromises()
    expect(urls()).toContain('/api/teams/1/lineups?size=5&game_id=3')
    expect(wrapper.text()).toContain('אין נתוני חמישיות למשחק הזה.')
  })

  it('error shows retry that refetches', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => [LINEUP] })
    const wrapper = mountIt()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    await button(wrapper, 'נסו שוב').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('יוסי כהן')
  })
})
