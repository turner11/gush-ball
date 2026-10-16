import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'


const NOW = new Date(2026, 2, 12, 12, 0)
const CLUBS = [
  { id: 5, name: 'מכבי', name_en: 'Maccabi', ibasketball_url: 'https://ibasketball.co.il/club/5/' },
  { id: 6, name: 'הפועל', name_en: null, ibasketball_url: null },
]
const TEAMS = [
  { id: 1, name: 'קבוצה א', name_en: 'Team A', club: 'מכבי' },
  { id: 2, name: 'קבוצה ב', name_en: 'Team B', club: 'מכבי' },
  { id: 3, name: 'קבוצה ג', name_en: 'Team C', club: 'הפועל' },
]
const opp = { name: 'מכבי', logo_url: null, source_url: null, address: null }
const GAMES = [
  { id: 10, team_id: 1, is_home: true, scheduled_at: '2026-03-14T18:00:00', status: 'scheduled', team_score: null, opponent_score: null, opponent: opp },
  { id: 12, team_id: 3, is_home: true, scheduled_at: '2026-03-13T18:00:00', status: 'scheduled', team_score: null, opponent_score: null, opponent: opp },
  { id: 11, team_id: 2, is_home: false, scheduled_at: '2026-03-10T18:00:00', status: 'final', team_score: 80, opponent_score: 70, opponent: opp },
]
const stubs = { GameLocationLinks: true, GameStatsLink: true, RouterLink: RouterLinkStub }

function mockFetch(games) {
  global.fetch = vi.fn((url) => {
    if (games instanceof Error) return Promise.reject(games)
    const body = String(url).startsWith('/api/games') ? games : url === '/api/clubs' ? CLUBS : TEAMS
    return Promise.resolve({ ok: true, status: 200, json: async () => body })
  })
}
const mountIt = async (path = '/clubs/maccabi') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/clubs/:clubSlug', name: 'club', component: { template: '<div/>' } },
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/teams', name: 'teams', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const { default: ClubView } = await import('./ClubView.vue')
  const w = mount(ClubView, { global: { plugins: [router], stubs } })
  await flushPromises()
  return w
}

describe('ClubView', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name], script[data-page]').forEach((el) => el.remove())
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

  it.each([
    [new Date(2026, 9, 21, 0, 30), '2026-10-14', '2026-10-28'], // Israel DST ends 25 Oct
    [new Date(2026, 2, 20, 23, 30), '2026-03-13', '2026-03-27'], // Israel DST starts 27 Mar
  ])('keeps whole calendar days across DST (%s)', async (now, from, to) => {
    vi.setSystemTime(now)
    mockFetch(GAMES)
    await mountIt()
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain(`/api/games?from=${from}&to=${to}`)
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

  it("only lists games of this club", async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    const ids = w.findAllComponents(RouterLinkStub).map((l) => l.props('to')?.params?.id)
    expect(ids).toContain(10)
    expect(ids).toContain(11)
    expect(ids).not.toContain(12)
    expect(w.text()).not.toContain('קבוצה ג')
  })

  it('shows the club name, English name and ibasketball link', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    expect(w.get('h1').text()).toBe('מכבי')
    expect(w.text()).toContain('Maccabi')
    const link = w.get('a[href="https://ibasketball.co.il/club/5/"]')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it("lists only this club's teams as links to their slugs", async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    const tos = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(tos).toContain('/team_a')
    expect(tos).toContain('/team_b')
    expect(tos).not.toContain('/team_c')
  })

  it('shows not-found with a way out for an unknown slug', async () => {
    mockFetch(GAMES)
    const w = await mountIt('/clubs/nope')
    expect(w.text()).toContain('המועדון לא נמצא')
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toContainEqual({ name: 'teams' })
  })

  it('sets the title and SportsOrganization JSON-LD', async () => {
    mockFetch(GAMES)
    await mountIt()
    expect(document.title).toBe('מכבי · Maccabi · כדורסל')
    const ld = JSON.parse(document.head.querySelector('script[data-page]').textContent)
    expect(ld['@type']).toBe('SportsOrganization')
    expect(ld.sameAs).toEqual(['https://ibasketball.co.il/club/5/'])
    expect(ld.member.map((m) => m.url)).toEqual([`${location.origin}/team_a`, `${location.origin}/team_b`])
  })

  it('shows the empty state for an empty week', async () => {
    mockFetch([])
    const w = await mountIt()
    expect(w.text()).toContain('אין משחקים במועדון השבוע')
  })

  it('shows an alert when the request fails', async () => {
    mockFetch(new Error('boom'))
    const w = await mountIt()
    expect(w.get('[role=alert]').text()).toContain('שגיאה בטעינת המועדון')
  })
})
