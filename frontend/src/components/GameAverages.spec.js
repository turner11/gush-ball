import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GameAverages from './GameAverages.vue'

const TEAM = { id: 1, name: 'קבוצה א', ibasketball_team_url: null }
const OPP = { id: 6, name: 'הפועל עבר', source_url: null }
const game = (team_score, opponent_score, day) => ({ team_score, opponent_score, scheduled_at: `2025-01-0${day}T18:00:00` })
const GAMES = [game(80, 70, 1), game(90, 60, 2), game(50, 70, 3)]
const row = (league_name, team_name, played, points_for, points_against) => ({ id: Math.random(), league_name, team_name, played, points_for, points_against })
const ROWS = [row('B', 'הפועל עבר', 2, 10, 10), row('A', 'קבוצה א', 3, 220, 200), row('A', 'הפועל עבר', 2, 150, 130)]

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const failed = { ok: false, status: 502, json: async () => ({}) }
function mockFetch(games, rows, oppResults = []) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams/1/games/9/opponent-results') return Promise.resolve(oppResults === null ? failed : ok(oppResults))
    return Promise.resolve(ok(url === '/api/standings' ? rows : games))
  })
}
async function mountIt() {
  const wrapper = mount(GameAverages, { props: { team: TEAM, opponent: OPP, gameId: 9 } })
  await flushPromises()
  return wrapper
}

describe('GameAverages', () => {
  afterEach(() => vi.restoreAllMocks())

  it('averages our games overall and by result, and the opponent from our league row only', async () => {
    mockFetch(GAMES, ROWS)
    const wrapper = await mountIt()
    const text = wrapper.find('table').text()
    for (const v of ['73.3', '66.7', '85.0', '50.0', '75.0', '65.0']) expect(text).toContain(v)
    expect(wrapper.findAll('tbody tr')[0].findAll('td')[1].text()).toBe('75.0') // league B's 5.0 is ignored
  })

  it("shows the opponent's averages in wins and losses from its results", async () => {
    mockFetch(GAMES, ROWS, [game(80, 70, 1), game(90, 60, 2), game(50, 70, 3)])
    const cells = (await mountIt()).findAll('tbody tr').map((tr) => tr.findAll('td')[1].text())
    expect(cells.slice(2)).toEqual(['85.0 (2 מש׳)', '65.0 (2 מש׳)', '50.0 (1 מש׳)', '70.0 (1 מש׳)'])
  })

  it('keeps our averages and dashes the opponent split when its results fail', async () => {
    mockFetch(GAMES, ROWS, null)
    const wrapper = await mountIt()
    expect(wrapper.findAll('tbody tr')[2].findAll('td')[0].text()).toContain('85.0')
    expect(wrapper.findAll('tbody tr')[2].findAll('td')[1].text()).toBe('—')
    expect(wrapper.text()).toContain('לא זמין כרגע')
    expect(wrapper.text()).not.toContain('שגיאה בטעינת הממוצעים')
  })

  it('dashes the opponent and explains when it has no standings row', async () => {
    mockFetch(GAMES, [ROWS[1]])
    const wrapper = await mountIt()
    expect(wrapper.text()).toContain('אין נתוני טבלה ליריבה')
    expect(wrapper.find('table').text()).toContain('—')
  })

  it('shows the empty state with no played games', async () => {
    mockFetch([], ROWS)
    expect((await mountIt()).text()).toContain('עדיין אין משחקים עם תוצאה')
  })

  it('shows the error with retry, and retrying fetches again', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))
    const wrapper = await mountIt()
    expect(wrapper.text()).toContain('שגיאה בטעינת הממוצעים')
    const calls = fetch.mock.calls.length
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(fetch.mock.calls.length).toBeGreaterThan(calls)
  })
})
