import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const LEAGUES = [
  { ibasketball_id: 1, name: 'ליגה א', url: 'https://x.il/league/a/' },
  { ibasketball_id: 2, name: 'ליגה ב', url: 'https://x.il/league/b' },
  { ibasketball_id: 3, name: 'ליגה ריקה', url: 'https://x.il/league/empty' },
]
const TEAMS = [
  { id: 1, name: 'א', ibasketball_league_url: 'https://x.il/league/a' },
  { id: 2, name: 'ב', ibasketball_league_url: 'https://x.il/league/b/' },
  { id: 3, name: 'ג', ibasketball_league_url: null },
]

async function setup(leaguesResponse) {
  global.fetch = vi.fn(() => leaguesResponse())
  const { useLeagueFilter } = await import('./useLeagueFilter')
  const filter = useLeagueFilter(ref(TEAMS))
  await flushPromises()
  return filter
}
const ok = (body) => () => Promise.resolve({ ok: true, status: 200, json: async () => body })

describe('useLeagueFilter', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('offers only leagues that hold a team, matching urls with or without a trailing slash', async () => {
    const { leagueOptions } = await setup(ok(LEAGUES))
    expect(leagueOptions.value.map((o) => o.label).sort()).toEqual(['ליגה א', 'ליגה ב'])
    expect(leagueOptions.value.map((o) => o.value).sort()).toEqual(['1', '2'])
  })

  it('teamsInLeague narrows to the chosen league and returns every team for an empty choice', async () => {
    const { leagueId, teamsInLeague } = await setup(ok(LEAGUES))
    expect(teamsInLeague.value).toHaveLength(3)
    leagueId.value = '2'
    expect(teamsInLeague.value.map((t) => t.id)).toEqual([2])
    leagueId.value = ''
    expect(teamsInLeague.value).toHaveLength(3)
  })

  it('a failed /leagues leaves no options and every team', async () => {
    const { leagueOptions, teamsInLeague } = await setup(() => Promise.reject(new Error('down')))
    expect(leagueOptions.value).toEqual([])
    expect(teamsInLeague.value).toHaveLength(3)
  })
})
