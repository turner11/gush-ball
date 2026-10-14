import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ClubWeek from './ClubWeek.vue'

const NOW = new Date(2026, 2, 12, 12, 0)
const TEAMS = [
  { id: 1, name: 'קבוצה א', name_en: 'Team A' },
  { id: 2, name: 'קבוצה ב', name_en: 'Team B' },
]
const opp = { name: 'מכבי', logo_url: null, source_url: null, address: null }
const GAMES = [
  { id: 10, team_id: 1, is_home: true, scheduled_at: '2026-03-14T18:00:00', status: 'scheduled', team_score: null, opponent_score: null, opponent: opp },
  { id: 11, team_id: 2, is_home: false, scheduled_at: '2026-03-10T18:00:00', status: 'final', team_score: 80, opponent_score: 70, opponent: opp },
]
const stubs = { GameLocationLinks: true, GameStatsLink: true, RouterLink: RouterLinkStub }

function mockFetch(games) {
  global.fetch = vi.fn((url) => {
    if (games instanceof Error) return Promise.reject(games)
    const body = String(url).startsWith('/api/games') ? games : TEAMS
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
}
const mountIt = async () => {
  const w = mount(ClubWeek, { global: { stubs } })
  await flushPromises()
  return w
}

describe('ClubWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches the ±7-day window once', async () => {
    mockFetch(GAMES)
    await mountIt()
    const urls = global.fetch.mock.calls.map((c) => c[0])
    expect(urls.filter((u) => u.startsWith('/api/games'))).toEqual(['/api/games?from=2026-03-05&to=2026-03-19'])
  })

  it('renders upcoming and past rows with their team', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    expect(w.text()).toContain('משחקים קרובים')
    expect(w.text()).toContain('תוצאות אחרונות')
    expect(w.text()).toContain('קבוצה א')
    expect(w.text()).toContain('קבוצה ב')
    const tos = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(tos).toContainEqual({ name: 'game', params: { slug: 'team_a', id: 10 } })
    expect(tos).toContainEqual({ name: 'game', params: { slug: 'team_b', id: 11 } })
  })

  it('shows the empty state for an empty week', async () => {
    mockFetch([])
    const w = await mountIt()
    expect(w.text()).toContain('אין משחקים במועדון השבוע')
  })

  it('shows an alert when the request fails', async () => {
    mockFetch(new Error('boom'))
    const w = await mountIt()
    expect(w.get('[role=alert]').text()).toContain('שגיאה בטעינת משחקי השבוע')
  })
})
