import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatGameDate } from '../lib/format'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]

const FUTURE_GAME = {
  id: 1,
  team_id: 1,
  is_home: true,
  scheduled_at: '2030-05-01T18:00:00',
  status: 'scheduled',
  has_stats: false,
  team_score: null,
  opponent_score: null,
  description: null,
  opponent: { id: 5, name: 'מכבי עתיד', name_en: null, logo_url: null, source_url: 'https://ibasketball.co.il/team/5/' },
}
const PAST_GAME = {
  id: 2,
  team_id: 1,
  is_home: false,
  scheduled_at: '2020-05-01T18:00:00',
  status: 'final',
  has_stats: true,
  team_score: 80,
  opponent_score: 70,
  description: null,
  opponent: { id: 6, name: 'הפועל עבר', name_en: null, logo_url: null, source_url: null },
}

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const method = options.method || 'GET'
    const key = `${method} ${url}`
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}

const FAIL = { ok: false, status: 500, json: async () => ({}) }

function jsonRes(body, status = 200) {
  return { ok: true, status, json: async () => body }
}

describe('ScheduleView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/stats', name: 'stats', component: { template: '<div/>' } },
        { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('results first, collapsed to the top rows', () => {
    const past = (n) => ({ ...PAST_GAME, id: 100 + n, scheduled_at: `2020-0${n}-01T18:00:00`, opponent: { ...PAST_GAME.opponent, id: 100 + n, name: `עבר ${n}` } })
    const future = (n) => ({ ...FUTURE_GAME, id: 200 + n, scheduled_at: `2030-0${n}-01T18:00:00`, opponent: { ...FUTURE_GAME.opponent, id: 200 + n, name: `עתיד ${n}` } })
    const PASTS = [1, 2, 3, 4, 5].map(past) // latest result is עבר 5, the oldest עבר 1
    const FUTURES = [1, 2, 3].map(future)

    async function mountGames(games) {
      mockFetch({
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes(games),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      return wrapper
    }
    const section = (wrapper, id) => wrapper.get(`#games-${id}`)
    const toggle = (wrapper, id) => wrapper.get(`button[aria-controls="games-${id}"]`)

    it('shows results before the next game', async () => {
      const wrapper = await mountGames([FUTURE_GAME, PAST_GAME])

      const text = wrapper.text()
      expect(text.indexOf('הפועל עבר')).toBeGreaterThan(-1)
      expect(text.indexOf('הפועל עבר')).toBeLessThan(text.indexOf('מכבי עתיד'))
      expect(wrapper.findAll('h2.section-title').map((h) => h.text())).toEqual(['תוצאות', 'המשחק הבא'])
      expect(text).toContain(formatGameDate('2030-05-01T18:00:00').time)
      expect(text).not.toContain('2030-05-01T18:00:00')
    })

    it('shows the next game first and the rest of upcoming behind a toggle', async () => {
      const wrapper = await mountGames(FUTURES)

      const rows = section(wrapper, 'upcoming').findAll(':scope > li')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('עתיד 1')
      expect(rows[0].attributes('inert')).toBeUndefined()
      expect(rows[1].text()).toContain('עתיד 2')
      expect(rows[1].attributes('inert')).toBeDefined()
      expect(section(wrapper, 'upcoming').text()).not.toContain('עתיד 3')
      expect(toggle(wrapper, 'upcoming').text()).toBe('כל המשחקים הקרובים (3)')
    })

    it('switching team collapses the expanded sections', async () => {
      mockFetch({
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes(PASTS),
        'GET /api/teams/2': () => jsonRes({ id: 2, name: 'קבוצה ב', ibasketball_team_url: null }),
        'GET /api/teams/2/games': () => jsonRes(PASTS),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const { useSelectedTeam } = await import('../composables/useSelectedTeam')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      await toggle(wrapper, 'past').trigger('click')
      expect(section(wrapper, 'past').findAll(':scope > li')).toHaveLength(5)

      useSelectedTeam().selectedTeamId.value = '2'
      await flushPromises()

      expect(section(wrapper, 'past').findAll(':scope > li')).toHaveLength(4)
      expect(toggle(wrapper, 'past').attributes('aria-expanded')).toBe('false')
    })
  })

  it('shows an inline error with retry when the load fails, and retrying loads the page', async () => {
    let failing = true
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => (failing ? FAIL : jsonRes([FUTURE_GAME])),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('משהו השתבש')
    failing = false
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('מכבי עתיד')
  })

  it('a failed team switch clears the previous team from the header and actions', async () => {
    mockFetch({
      'GET /api/auth/me': () => jsonRes({ username: 'a', team_ids: [1, 2] }),
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME]),
      'GET /api/teams/2': () => FAIL,
      'GET /api/teams/2/games': () => FAIL,
    })
    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.text()).toContain('הוספת משחק')

    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('קבוצה א')
    expect(wrapper.text()).not.toContain('הוספת משחק')
  })

  describe('practices', () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 19)
    const later = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19)
    const practice = (id, starts_at) => ({ id, starts_at, duration_minutes: 90, location: 'אולם הבית', notes: null, cancelled: false })
    const base = {
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME]),
    }
    const feedHasPractices = (wrapper) => wrapper.findComponent({ name: 'CalendarSubscribe' }).props('practices')

    it('fetches and shows upcoming practices for a team member', async () => {
      mockFetch({
        ...base,
        'GET /api/auth/me': () => jsonRes({ username: 'p', member_team_ids: [1] }),
        'GET /api/teams/1/practices': () => jsonRes([practice(1, soon), practice(2, later)]),
      })

      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()

      expect(wrapper.text()).toContain('אימונים קרובים')
      expect(wrapper.findAll('li .badge-muted').filter((b) => b.text() === 'אימון')).toHaveLength(1)
      expect(wrapper.text()).toContain('אולם הבית')
    })

    it('never requests practices for an anonymous visitor', async () => {
      mockFetch({ ...base, 'GET /api/auth/me': () => ({ ok: false, status: 401, statusText: 'x', json: async () => ({}) }) })

      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()

      expect(global.fetch.mock.calls.some(([url]) => url.includes('/practices'))).toBe(false)
      expect(feedHasPractices(wrapper)).toBe(false)
      expect(wrapper.text()).not.toContain('אימונים קרובים')
    })

    it('anonymous preview hides practices; exiting loads them', async () => {
      mockFetch({
        ...base,
        'GET /api/auth/me': () => jsonRes({ username: 'p', member_team_ids: [1] }),
        'GET /api/teams/1/practices': () => jsonRes([practice(1, soon)]),
      })
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'anonymous'

      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      expect(global.fetch.mock.calls.some(([url]) => url.includes('/practices'))).toBe(false)
      expect(wrapper.text()).not.toContain('אימונים קרובים')
      expect(feedHasPractices(wrapper)).toBe(false)

      previewMode.value = null
      await flushPromises()
      expect(wrapper.text()).toContain('אימונים קרובים')
    })

    it('gives members the practices feed link', async () => {
      mockFetch({
        ...base,
        'GET /api/auth/me': () => jsonRes({ username: 'p', member_team_ids: [1] }),
        'GET /api/teams/1/practices': () => jsonRes([]),
      })

      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()

      expect(feedHasPractices(wrapper)).toBe(true)
      expect(wrapper.text()).toContain('אין אימונים בשבועיים הקרובים')
    })
  })

  it('shows scores home side first, matching the home page', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([PAST_GAME, { ...PAST_GAME, id: 3, is_home: true }]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    // PAST_GAME is an 80–70 away win: the hosts' 70 reads first; the same result at home reads 80 first
    const scores = wrapper.findAll('[data-score=desktop]').map((s) => s.text())
    expect(scores.sort()).toEqual(['70 : 80', '80 : 70'])
  })

  it('shows the opponent logo only when it has one', async () => {
    const withLogo = { ...FUTURE_GAME, opponent: { ...FUTURE_GAME.opponent, logo_url: 'https://l/f.png' } }
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([withLogo, PAST_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    const imgs = wrapper.findAll('ol img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0].attributes('src')).toBe('https://l/f.png')
  })

  it('links the opponent only when it has a source_url', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    const links = wrapper.findAll('ol a[target="_blank"]')
    expect(links).toHaveLength(1)
    expect(links[0].text()).toBe('מכבי עתיד')
    expect(links[0].attributes('href')).toBe('https://ibasketball.co.il/team/5/')
    expect(links[0].attributes('target')).toBe('_blank')
    expect(wrapper.text()).toContain('הפועל עבר')
  })

  it('renders a Hebrew status label, not the raw enum value', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('מתוכנן')
    expect(wrapper.text()).not.toContain('scheduled')
  })

  it('shows an empty state when the team has no games', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין משחקים עדיין')
  })

  it('links the club team name to ibasketball only when the team has a URL', async () => {
    const url = 'https://ibasketball.co.il/team/13638/'
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: url }),
      'GET /api/teams/1/games': () => jsonRes([]),
    })
    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    const link = wrapper.find('h1 + a')
    expect(link.text()).toBe('דף הקבוצה באיגוד')
    expect(link.attributes('href')).toBe(url)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('shows no club link when ibasketball_team_url is null', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([]),
    })
    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('h1 + a').exists()).toBe(false)
  })

  describe('location links', () => {
    const ADDR = 'האולם 1, תל אביב'
    async function mountWith(address) {
      mockFetch({
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null, home_court_address: address }),
        'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      return wrapper
    }

    it('shows maps and waze links on home game rows', async () => {
      const row = (await mountWith(ADDR)).findAll('li')[1]
      expect(row.find(`a[href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDR)}"]`).exists()).toBe(true)
      expect(row.find(`a[href^="https://waze.com/ul?q=${encodeURIComponent(ADDR)}"]`).exists()).toBe(true)
    })

    it('hides location links on away games and when team has no address', async () => {
      const away = (await mountWith(ADDR)).findAll('li')[0]
      expect(away.find('a[href*="waze.com"]').exists()).toBe(false)
      const none = await mountWith(null)
      expect(none.find('a[href*="waze.com"]').exists()).toBe(false)
      expect(none.find('a[href*="google.com/maps"]').exists()).toBe(false)
    })

    it('uses the opponent address on away games', async () => {
      const OPP = 'רחוב היריבה 2, חיפה'
      mockFetch({
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null, home_court_address: ADDR }),
        'GET /api/teams/1/games': () =>
          jsonRes([FUTURE_GAME, { ...PAST_GAME, opponent: { ...PAST_GAME.opponent, address: OPP } }]),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()

      const away = wrapper.findAll('li')[0]
      expect(away.find(`a[href^="https://waze.com/ul?q=${encodeURIComponent(OPP)}"]`).exists()).toBe(true)
    })

    it('renders the waze link as an icon', async () => {
      const a = (await mountWith(ADDR)).find('a[href*="waze.com"]')
      expect(a.find('svg').exists()).toBe(true)
      expect(a.text()).toBe('')
      expect(a.attributes('aria-label')).toContain(ADDR)
    })
  })

  describe('team order and home badge', () => {
    async function rows() {
      mockFetch({
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      return wrapper.findAll('li')
    }

    it('lists our team first on home games and the opponent first on away games', async () => {
      const [away, home] = await rows()
      const h = home.text()
      const a = away.text()
      expect(h.indexOf('קבוצה א')).toBeGreaterThan(-1)
      expect(h.indexOf('קבוצה א')).toBeLessThan(h.indexOf('מכבי עתיד'))
      expect(a.indexOf('הפועל עבר')).toBeLessThan(a.indexOf('קבוצה א'))
    })

    it('hides our own team (not the opponent) below sm', async () => {
      const [away, home] = await rows()
      const hidden = (row, name) => row.findAll('span').find((s) => s.text() === name).classes()
      expect(hidden(home, 'קבוצה א')).toContain('max-sm:hidden')
      expect(hidden(home, 'מכבי עתיד')).not.toContain('max-sm:hidden')
      expect(hidden(away, 'קבוצה א')).toContain('max-sm:hidden')
      expect(hidden(away, 'הפועל עבר')).not.toContain('max-sm:hidden')
    })

    it('marks home and away games with a badge', async () => {
      const [away, home] = await rows()
      expect(home.findAll('.badge').map((b) => b.text())).toContain('בית')
      expect(away.findAll('.badge').map((b) => b.text())).toContain('חוץ')
    })
  })

  it('shows the stats link only for games with has_stats', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('a[href="/stats?game=2"]')).toHaveLength(1)
    expect(wrapper.find('a[href^="/stats?game=1"]').exists()).toBe(false)
  })

  describe('live stats link', () => {
    const ADMIN = { username: 'a', team_id: null, stats_app_url: 'https://app.streamlit.app', stats_template_url: '' }
    const WITH_SHEET = { ...FUTURE_GAME, stats_url: 'https://docs.google.com/spreadsheets/d/X/edit' }

    async function mountWith(me, games) {
      mockFetch({
        'GET /api/auth/me': me,
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes(games),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      return wrapper
    }

    it('shows for an in-scope admin when stats_url is set and there are no stats yet', async () => {
      const wrapper = await mountWith(() => jsonRes(ADMIN), [WITH_SHEET])
      const link = wrapper.find('a[target="_blank"][href^="https://app.streamlit.app"]')
      expect(link.exists()).toBe(true)
      expect(link.text()).toContain('סטטיסטיקה חיה')
    })

    it('is hidden from fans', async () => {
      const wrapper = await mountWith(() => ({ ok: false, status: 401, statusText: 'x', json: async () => ({}) }), [WITH_SHEET])
      expect(wrapper.find('a[href^="https://app.streamlit.app"]').exists()).toBe(false)
    })

    it('yields to the lineups link once the game has stats', async () => {
      const wrapper = await mountWith(() => jsonRes(ADMIN), [{ ...PAST_GAME, stats_url: WITH_SHEET.stats_url }])
      expect(wrapper.findAll('a[href="/stats?game=2"]')).toHaveLength(1)
      expect(wrapper.find('a[href^="https://app.streamlit.app"]').exists()).toBe(false)
    })
  })

  describe('inline game editing', () => {
    const ME = { username: 'a', team_ids: [1] }
    const NEW_GAME = { ...FUTURE_GAME, id: 3, opponent: { ...FUTURE_GAME.opponent, id: 7, name: 'בני חדש' } }

    async function mountWith(extra = {}, mountOptions = {}) {
      mockFetch({
        'GET /api/auth/me': () => jsonRes(ME),
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME]),
        ...extra,
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const wrapper = mount(ScheduleView, { global: { plugins: [router] }, ...mountOptions })
      await flushPromises()
      return wrapper
    }
    const button = (wrapper, text) => wrapper.findAll('button').find((b) => b.text().includes(text))

    it('the header holds only the add button and calendar menu; the practices toggle sits in the practices section (#515)', async () => {
      const wrapper = await mountWith({
        'GET /api/auth/me': () => jsonRes({ username: 'a', team_ids: [1], member_team_ids: [1] }),
        'GET /api/teams/1/practices': () => jsonRes([]),
      })
      const header = wrapper.get('.page-header')
      const labels = header.findAll('button').map((b) => b.text())
      expect(labels.some((l) => l.includes('הוספת משחק'))).toBe(true)
      expect(labels.some((l) => l.includes('הוספה ליומן'))).toBe(true)
      expect(header.text()).not.toContain('עריכת אימונים')
      const section = wrapper.findAll('.section-header').find((h) => h.find('h2').text() === 'אימונים קרובים')
      expect(section.text()).toContain('עריכת אימונים')
    })

    it('team admin adds a game from the schedule and it appears under upcoming', async () => {
      const wrapper = await mountWith({ 'POST /api/teams/1/games': () => jsonRes(NEW_GAME, 201) })
      await button(wrapper, 'הוספת משחק').trigger('click')
      await wrapper.find('#game-opponent-name').setValue('בני חדש')
      await wrapper.find('#game-scheduled-at').setValue('2030-06-01T18:00')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const [, options] = global.fetch.mock.calls.find(([u, o]) => u === '/api/teams/1/games' && o?.method === 'POST')
      expect(JSON.parse(options.body).opponent_name).toBe('בני חדש')
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.text()).toContain('בני חדש')
      expect(wrapper.get('#games-upcoming').findAll(':scope > li').find((li) => li.text().includes('בני חדש')).attributes('inert')).toBeUndefined()
    })

    it("the add form's ביטול closes it and returns focus to the add button", async () => {
      const wrapper = await mountWith({}, { attachTo: document.body })
      await button(wrapper, 'הוספת משחק').trigger('click')
      await button(wrapper, 'ביטול').trigger('click')
      await flushPromises()

      expect(wrapper.find('#add-game-form').exists()).toBe(false)
      expect(document.activeElement).toBe(button(wrapper, 'הוספת משחק').element)
      wrapper.unmount()
    })

    it('collapsing results keeps an open add form, and closes only an editor hidden in the tail', async () => {
      const past = (n) => ({ ...PAST_GAME, id: 100 + n, scheduled_at: `2020-0${n}-01T18:00:00`, opponent: { ...PAST_GAME.opponent, id: 100 + n, name: `עבר ${n}` } })
      const wrapper = await mountWith({ 'GET /api/teams/1/games': () => jsonRes([1, 2, 3, 4, 5].map(past)) })
      const toggle = () => wrapper.get('button[aria-controls="games-past"]')
      await toggle().trigger('click') // expand results
      await button(wrapper, 'הוספת משחק').trigger('click')
      await toggle().trigger('click') // collapse
      expect(wrapper.find('#add-game-form').exists()).toBe(true)

      await button(wrapper, 'ביטול').trigger('click')
      await toggle().trigger('click') // expand
      await wrapper.get('#edit-game-101').trigger('click') // oldest game, hidden once collapsed
      await toggle().trigger('click') // collapse
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('team admin edits a game inline through the same PATCH, without touching stats_url', async () => {
      const done = { ...FUTURE_GAME, status: 'final', team_score: 90, opponent_score: 80 }
      const wrapper = await mountWith({ 'PATCH /api/teams/1/games/1': () => jsonRes(done) })
      await button(wrapper, 'עריכה').trigger('click')
      await wrapper.find('#game-status').setValue('final')
      await wrapper.find('#game-team-score').setValue('90')
      await wrapper.find('#game-opponent-score').setValue('80')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const [, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      const body = JSON.parse(options.body)
      expect(body.status).toBe('final')
      expect(body).not.toHaveProperty('stats_url')
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.text()).toContain('90 : 80')
    })

    it('team admin edits practices inline from the schedule, and closing reloads them (#499)', async () => {
      const wrapper = await mountWith({
        'GET /api/auth/me': () => jsonRes({ username: 'a', team_ids: [1], member_team_ids: [1] }),
        'GET /api/teams/1/practices': () => jsonRes([]),
      })
      const practiceGets = () => global.fetch.mock.calls.filter(([u, o]) => u === '/api/teams/1/practices' && !o?.method).length
      expect(wrapper.findAll('h2').some((h) => h.text() === 'אימונים קרובים')).toBe(true)

      await button(wrapper, 'עריכת אימונים').trigger('click')
      await flushPromises()
      expect(wrapper.findComponent({ name: 'PracticesAdmin' }).exists()).toBe(true)
      expect(wrapper.findAll('h2').some((h) => h.text() === 'אימונים קרובים')).toBe(false)

      const before = practiceGets()
      await button(wrapper, 'סיום עריכה').trigger('click')
      await flushPromises()
      expect(practiceGets()).toBeGreaterThan(before)
      expect(wrapper.findComponent({ name: 'PracticesAdmin' }).exists()).toBe(false)
    })

    it('fans and "view as player" see no add or edit controls', async () => {
      const { previewMode } = await import('../composables/useAuth')
      mockFetch({
        'GET /api/auth/me': () => ({ ok: false, status: 401, statusText: 'x', json: async () => ({}) }),
        'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
        'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME]),
      })
      const { default: ScheduleView } = await import('./ScheduleView.vue')
      const fan = mount(ScheduleView, { global: { plugins: [router] } })
      await flushPromises()
      expect(button(fan, 'הוספת משחק')).toBeUndefined()
      expect(button(fan, 'עריכה')).toBeUndefined()
      expect(button(fan, 'עריכת אימונים')).toBeUndefined()

      previewMode.value = 'member'
      const preview = await mountWith()
      expect(button(preview, 'הוספת משחק')).toBeUndefined()
      expect(button(preview, 'עריכה')).toBeUndefined()
      expect(button(preview, 'עריכת אימונים')).toBeUndefined()
      previewMode.value = null
    })
  })
})
