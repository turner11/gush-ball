import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'


const NOW = new Date(2026, 2, 12, 12, 0)
const NO_ABOUT = { about_title: null, about_title_en: null, about: null, about_en: null, about_images: [], about_links: [], officials: [] }
const CLUBS = [
  {
    id: 5, name: 'מכבי', name_en: 'Maccabi', ibasketball_url: 'https://ibasketball.co.il/club/5/', ...NO_ABOUT,
    about_title: 'הסיפור שלנו',
    about: 'מועדון קהילתי\nמאז 1990',
    about_images: [{ url: 'https://cdn.example.com/a.jpg', title: 'האולם', title_en: null }],
    about_links: [{ label: 'האתר שלנו', label_en: null, url: 'https://club.example.com/' }],
    officials: [
      { name: 'דני כהן', position: 'יו״ר', image_url: 'https://cdn.example.com/d.jpg', about: 'ותיק המועדון' },
      { name: 'רונית לוי', position: 'מזכירה', image_url: null, about: null },
    ],
  },
  { id: 6, name: 'הפועל', name_en: null, ibasketball_url: null, ...NO_ABOUT },
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

const FTEAMS = [
  { id: 1, name: 'זד', name_en: 'Zed', club: 'מכבי', ibasketball_league_url: 'https://x.il/league/allstars' },
  { id: 2, name: 'רויאל', name_en: 'Royal', club: 'מכבי', ibasketball_league_url: null },
  { id: 3, name: 'אלפא', name_en: 'Alpha', club: 'מכבי', ibasketball_league_url: null },
  { id: 4, name: 'וולבס', name_en: 'Wolves', club: 'מכבי', ibasketball_league_url: 'https://x.il/league/other/' },
]
const LEAGUES = [
  { name: 'Allstars', url: 'https://x.il/league/allstars/' }, // trailing slash differs from the team's url
  { name: 'Other', url: 'https://x.il/league/other' },
]
const FGAMES = [
  { id: 20, team_id: 3, is_home: true, scheduled_at: '2026-03-14T18:00:00', status: 'scheduled', team_score: null, opponent_score: null, opponent: opp },
  { id: 21, team_id: 4, is_home: true, scheduled_at: '2026-03-14T19:00:00', status: 'scheduled', team_score: null, opponent_score: null, opponent: opp },
]

function mockFetch(games, teams = TEAMS, leagues = [], posts = []) {
  global.fetch = vi.fn((url) => {
    if (String(url).endsWith('/posts')) return posts instanceof Error ? Promise.reject(posts) : Promise.resolve({ ok: true, status: 200, json: async () => posts })
    if (games instanceof Error) return Promise.reject(games)
    if (url === '/api/leagues') return leagues instanceof Error ? Promise.reject(leagues) : Promise.resolve({ ok: true, status: 200, json: async () => leagues })
    const body = String(url).startsWith('/api/games') ? games : url === '/api/clubs' ? CLUBS : teams
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

  it('puts the about block before the teams and the week', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    expect(w.findAll('h2').map((h) => h.text())).toEqual(['הסיפור שלנו', 'בעלי תפקידים', 'הקבוצות', 'השבוע במועדון'])
  })

  it('lists officials under the about block, in order', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    const text = w.text()
    expect(w.findAll('li h3').map((h) => h.text())).toEqual(['דני כהן', 'רונית לוי'])
    expect(text).toContain('יו״ר')
    expect(text).toContain('ותיק המועדון')
    expect(text.indexOf('מועדון קהילתי')).toBeLessThan(text.indexOf('בעלי תפקידים'))
    expect(text.indexOf('בעלי תפקידים')).toBeLessThan(text.indexOf('הקבוצות'))
    expect(w.findAll('li img').map((i) => i.attributes('src'))).toEqual(['https://cdn.example.com/d.jpg', '/default-player.png'])
  })

  it('hides officials when there are none', async () => {
    mockFetch(GAMES)
    const w = await mountIt('/clubs/6')
    expect(w.text()).not.toContain('בעלי תפקידים')
  })

  it('renders the about block: title, text, link chips and images', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    expect(w.findAll('h2').map((h) => h.text())).toContain('הסיפור שלנו')
    expect(w.text()).toContain('מועדון קהילתי')
    const link = w.get('a[href="https://club.example.com/"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(w.get('img[alt="האולם"]').attributes('src')).toBe('https://cdn.example.com/a.jpg')
  })

  it('clicking an about image opens the in-page viewer', async () => {
    mockFetch(GAMES)
    const w = await mountIt()
    await w.get('button[aria-label="הגדלת תמונה: האולם"]').trigger('click')
    expect(w.get('dialog').attributes('open')).toBeDefined()
    expect(w.get('dialog img').attributes('src')).toBe('https://cdn.example.com/a.jpg')
  })

  it('hides the about block when the club has no about content', async () => {
    mockFetch(GAMES)
    const w = await mountIt('/clubs/6')
    expect(w.text()).not.toContain('על המועדון')
  })

  it('shows the edit button to a club admin and full admin, never to anonymous or in preview', async () => {
    const { useAuth, previewMode } = await import('../composables/useAuth')
    const editBtn = (w) => w.findAll('button').some((b) => b.text() === 'עריכת עמוד המועדון')
    for (const [user, preview, shown] of [
      [{ team_ids: [1], clubs: ['מכבי'] }, null, true],
      [{ team_ids: [1], clubs: ['אחר'] }, null, false],
      [{ team_ids: null }, null, true],
      [{ team_ids: null }, 'member', false],
      [null, null, false],
    ]) {
      useAuth().user.value = user
      previewMode.value = preview
      mockFetch(GAMES)
      expect(editBtn(await mountIt()), JSON.stringify([user, preview])).toBe(shown)
    }
    useAuth().user.value = null
    previewMode.value = null
  })

  describe('inline editing', () => {
    const openEditor = async () => {
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { team_ids: null }
      mockFetch(GAMES)
      const base = global.fetch
      global.fetch = vi.fn((url, o = {}) =>
        o.method === 'PUT'
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ...CLUBS[0], ...JSON.parse(o.body) }) })
          : base(url, o),
      )
      const w = await mountIt()
      await w.findAll('button').find((b) => b.text() === 'עריכת עמוד המועדון').trigger('click')
      return w
    }
    afterEach(async () => {
      const { useAuth, previewMode } = await import('../composables/useAuth')
      useAuth().user.value = null
      previewMode.value = null
    })

    it('club admin edits about and officials inline and sees the result', async () => {
      const w = await openEditor()
      await w.get('#club-about-title').setValue('כותרת חדשה')
      await w.get('#club-about-editor').trigger('submit')
      await flushPromises()

      const [url, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
      expect(url).toBe('/api/clubs/5/about')
      expect(JSON.parse(options.body).officials).toHaveLength(2)
      expect(w.find('#club-about-editor').exists()).toBe(false)
      expect(w.findAll('h2').map((h) => h.text())).toContain('כותרת חדשה')
    })

    it('turning on the preview closes an open editor', async () => {
      const w = await openEditor()
      expect(w.find('#club-about-editor').exists()).toBe(true)
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'member'
      await nextTick()
      expect(w.find('#club-about-editor').exists()).toBe(false)
    })
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

  describe('team filter', () => {
    const search = async (w, q) => {
      await w.get('#club-team-search').setValue(q)
      await flushPromises()
    }
    const teamLinks = (w) => w.findAllComponents(RouterLinkStub).map((l) => l.props('to')).filter((to) => typeof to === 'string' && to.startsWith('/'))
    const gameIds = (w) => w.findAllComponents(RouterLinkStub).map((l) => l.props('to')?.params?.id).filter(Boolean)

    it('orders matches: name prefix, then name substring, then league name', async () => {
      mockFetch(FGAMES, FTEAMS, LEAGUES)
      const w = await mountIt()
      await search(w, 'al')
      expect(teamLinks(w)).toEqual(['/alpha', '/royal', '/zed'])
    })

    it("filters the week's games to the matching teams", async () => {
      mockFetch(FGAMES, FTEAMS, LEAGUES)
      const w = await mountIt()
      expect(gameIds(w)).toEqual(expect.arrayContaining([20, 21]))
      await search(w, 'al')
      expect(gameIds(w)).toContain(20)
      expect(gameIds(w)).not.toContain(21)
    })

    it('is case-insensitive', async () => {
      mockFetch(FGAMES, FTEAMS, LEAGUES)
      const w = await mountIt()
      await search(w, 'RoYaL')
      expect(teamLinks(w)).toEqual(['/royal'])
      expect(w.get('[aria-live]').text()).toBe('קבוצה אחת')
    })

    it('shows a no-match state whose clear button restores all teams', async () => {
      mockFetch(FGAMES, FTEAMS, LEAGUES)
      const w = await mountIt()
      await search(w, 'qqq')
      expect(teamLinks(w)).toEqual([])
      expect(w.text()).toContain('אין קבוצות התואמות לחיפוש "qqq"')
      await w.get('button.btn-secondary').trigger('click')
      await flushPromises()
      expect(teamLinks(w)).toHaveLength(4)
    })

    it('keeps the page working when /leagues fails', async () => {
      mockFetch(FGAMES, FTEAMS, new Error('boom'))
      const w = await mountIt()
      expect(w.find('[role=alert]').exists()).toBe(false)
      await search(w, 'al')
      expect(teamLinks(w)).toEqual(['/alpha', '/royal'])
    })

    it('leaves the JSON-LD members unchanged while filtering', async () => {
      mockFetch(FGAMES, FTEAMS, LEAGUES)
      const w = await mountIt()
      await search(w, 'al')
      const ld = JSON.parse(document.head.querySelector('script[data-page]').textContent)
      expect(ld.member).toHaveLength(4)
    })
  })

  it('shows the club posts with the pinned badge', async () => {
    mockFetch(GAMES, TEAMS, [], [{ id: 1, club_id: 5, title: 'חדשות', body: 'גוף העדכון', pinned: true }])
    const w = await mountIt()
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/clubs/5/posts')
    expect(w.text()).toContain('חדשות')
    expect(w.text()).toContain('גוף העדכון')
    expect(w.text()).toContain('נעוץ')
  })

  it('a failed posts load keeps the page and shows an inline error', async () => {
    mockFetch(GAMES, TEAMS, [], new Error('boom'))
    const w = await mountIt()
    expect(w.get('h1').text()).toBe('מכבי')
    expect(w.get('[role="alert"]').text()).toContain('שגיאה בטעינת העדכונים')
  })
})
