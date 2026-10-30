import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PLAYERS = [{ id: 1, team_id: 1, name: 'יוסי כהן', jersey_number: 7, images: [] }]
const game = (id, day, has_stats) => ({
  id,
  team_id: 1,
  scheduled_at: `2026-03-${day}T18:00:00`,
  has_stats,
  opponent: { id: 10 + id, name: `יריבה ${id}` },
})
const GAMES = [game(1, '01', false), game(2, '04', true), game(3, '11', true)]
const LINEUPS = 'GET /api/teams/1/lineups?size=5'

function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body }
}

const MEMBER = { username: 'p', is_admin: false, can_view_stats: true, memberships: [{ id: 1, team_id: 1, club: null, role: 'member' }] }
const UNAUTHORIZED = () => ({ ok: false, status: 401, statusText: 'x', json: async () => ({}) })

function mockFetch(overrides = {}) {
  const handlers = {
    'GET /api/auth/me': () => jsonRes(MEMBER),
    'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    'GET /api/teams/1/games': () => jsonRes(GAMES),
    'GET /api/teams/1/games/scorers': () => jsonRes([]),
    [LINEUPS]: () => jsonRes([]),
    [`${LINEUPS}&game_id=2`]: () => jsonRes([]),
    [`${LINEUPS}&game_id=3`]: () => jsonRes([]),
    ...overrides,
  }
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    return handler ? Promise.resolve(handler()) : Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

const urls = () => global.fetch.mock.calls.map(([u]) => u)
const NOTE = 'המשחק המבוקש לא נמצא'

describe('StatsView', () => {
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
        { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
        { path: '/join', name: 'join', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => vi.restoreAllMocks())

  async function mountView() {
    const { default: StatsView } = await import('./StatsView.vue')
    const wrapper = mount(StatsView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  async function mountAt(path = '/stats') {
    mockFetch()
    await router.push(path)
    return mountView()
  }

  it('titles the page נתונים', async () => {
    const wrapper = await mountAt()
    expect(wrapper.find('h1').text()).toBe('נתונים')
  })

  it('picker lists "all games" plus only has_stats games, newest first', async () => {
    const wrapper = await mountAt()
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['', '3', '2'])
    expect(options[1].text()).toContain('יריבה 3')
  })

  it("picking a game pushes ?game= and loads that game's lineups", async () => {
    const wrapper = await mountAt()
    await wrapper.find('select').setValue('2')
    await flushPromises()
    expect(router.currentRoute.value.query.game).toBe('2')
    expect(urls()).toContain('/api/teams/1/lineups?size=5&game_id=2')

    await wrapper.find('select').setValue('')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('deep link /stats?game=2 preselects it', async () => {
    const wrapper = await mountAt('/stats?game=2')
    expect(wrapper.find('select').element.value).toBe('2')
    expect(urls()).toContain('/api/teams/1/lineups?size=5&game_id=2')
    expect(wrapper.text()).not.toContain(NOTE)
  })

  it.each(['99', '1'])('unknown ?game=%s falls back to all games with a note', async (id) => {
    const wrapper = await mountAt(`/stats?game=${id}`)
    expect(wrapper.find('select').element.value).toBe('')
    expect(urls()).toContain('/api/teams/1/lineups?size=5')
    expect(urls().some((u) => u.includes('game_id'))).toBe(false)
    expect(wrapper.text()).toContain(NOTE)
    expect(router.currentRoute.value.query.game).toBe(id)
  })

  it('team without stats shows the empty state', async () => {
    mockFetch({ 'GET /api/teams/1/games': () => jsonRes([game(1, '01', false)]) })
    await router.push('/stats')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('עדיין אין נתונים לקבוצה')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(urls().some((u) => u.includes('lineups'))).toBe(false)
  })

  describe('live stats link', () => {
    const SHEET = 'https://docs.google.com/spreadsheets/d/X/edit'
    const ADMIN = { username: 'a', team_id: null, can_view_stats: true, stats_app_url: 'https://app.streamlit.app', stats_template_url: '' }
    const LIVE = 'a[target="_blank"][href^="https://app.streamlit.app"]'

    async function mountAs(me, path) {
      mockFetch({
        'GET /api/auth/me': me,
        'GET /api/teams/1/games': () => jsonRes(GAMES.map((g) => ({ ...g, stats_url: SHEET }))),
      })
      await router.push(path)
      return mountView()
    }

    it('shows for an admin on a selected game', async () => {
      const wrapper = await mountAs(() => jsonRes(ADMIN), '/stats?game=2')
      const link = wrapper.find(LIVE)
      expect(link.text()).toContain('סטטיסטיקה חיה')
      expect(new URL(link.attributes('href')).searchParams.get('data')).toBe(SHEET)
    })

    it('is hidden on "all games"', async () => {
      const wrapper = await mountAs(() => jsonRes(ADMIN), '/stats')
      expect(wrapper.find(LIVE).exists()).toBe(false)
    })

    it('is hidden from members', async () => {
      const wrapper = await mountAs(() => jsonRes(MEMBER), '/stats?game=2')
      expect(wrapper.find(LIVE).exists()).toBe(false)
    })
  })

  describe('access prompt', () => {
    const noData = () => expect(urls().some((u) => /players|games|lineups/.test(u))).toBe(false)

    async function mountAsUser(me, path = '/stats') {
      mockFetch({ 'GET /api/auth/me': me })
      await router.push(path)
      return mountView()
    }

    it('anonymous sees the sign-in prompt and loads nothing', async () => {
      const wrapper = await mountAsUser(UNAUTHORIZED, '/stats?game=2')
      expect(wrapper.text()).toContain('הסטטיסטיקה זמינה לשחקני המועדון')
      expect(wrapper.find('a.btn-primary').attributes('href')).toBe('/admin/login?next=/stats?game=2')
      noData()
    })

    it('admin in the anonymous preview sees the sign-in prompt and loads nothing', async () => {
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'anonymous'
      const wrapper = await mountAsUser(() => jsonRes({ username: 'a', can_view_stats: true, team_id: null }), '/stats')
      expect(wrapper.find('a.btn-primary').text()).toContain('כניסה / הרשמה')
      noData()
      previewMode.value = null
    })

    it('pending user sees waiting for approval with a link to join', async () => {
      const me = { username: 'p', can_view_stats: false, memberships: [{ id: 1, team_id: 1, club: null, role: 'pending' }] }
      const wrapper = await mountAsUser(() => jsonRes(me))
      expect(wrapper.text()).toContain('ממתינה לאישור')
      expect(wrapper.find('a').attributes('href')).toBe('/join')
      noData()
    })

    it('logged-in user without rows sees the join CTA', async () => {
      const wrapper = await mountAsUser(() => jsonRes({ username: 'p', can_view_stats: false, memberships: [] }))
      expect(wrapper.text()).toContain('בקשת הצטרפות')
      expect(wrapper.find('a').attributes('href')).toBe('/join')
      noData()
    })
  })

  it('games load error shows retry that reloads', async () => {
    global.fetch = vi.fn((url) =>
      url.endsWith('/games')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(jsonRes(url.includes('auth/me') ? MEMBER : url.includes('players') ? PLAYERS : [])),
    )
    await router.push('/stats')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('שגיאה בטעינת הסטטיסטיקה')

    mockFetch()
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()
    expect(wrapper.find('select').exists()).toBe(true)
  })

  describe('season charts', () => {
    const scored = (id, day, ours, theirs) => ({ ...game(id, day, false), status: 'final', team_score: ours, opponent_score: theirs })
    const srow = (game_id, day, player_id, name, points) => ({
      game_id, scheduled_at: `2026-03-${day}T18:00:00`, opponent_name: `יריבה ${game_id}`, player_id, name, jersey_number: 1, points,
    })
    const SCORERS = [srow(1, '01', 1, 'אלף', 5), srow(1, '01', 2, 'בית', 9), srow(2, '08', 1, 'אלף', 6), srow(2, '08', 2, 'בית', 11)]
    const SCORED_GAMES = () => jsonRes([scored(1, '01', 40, 30), scored(2, '08', 50, 55)])

    it('shows team-vs-opponent and players scoring charts for a viewer; the select switches the highlight', async () => {
      mockFetch({ 'GET /api/teams/1/games': SCORED_GAMES, 'GET /api/teams/1/games/scorers': () => jsonRes(SCORERS) })
      await router.push('/stats')
      const wrapper = await mountView()
      expect(wrapper.findAll('svg[role=img]')).toHaveLength(2)
      const select = wrapper.find('#highlight-player')
      expect(select.element.value).toBe('2') // top total scorer
      const highlighted = () => wrapper.findAll('svg[role=img]')[1].find('g.text-team circle title').text()
      expect(highlighted()).toContain('בית')
      const players = () => wrapper.findAll('svg[role=img]')[1]
      expect(players().findAll('polyline.text-team')).toHaveLength(1)
      await select.setValue('1')
      expect(select.element.value).toBe('1')
      expect(highlighted()).toContain('אלף')
      expect(players().findAll('polyline.text-team')).toHaveLength(1)
    })

    it('charts still render when the team has no BBStats games', async () => {
      mockFetch({ 'GET /api/teams/1/games': SCORED_GAMES, 'GET /api/teams/1/games/scorers': () => jsonRes(SCORERS) })
      await router.push('/stats')
      const wrapper = await mountView()
      expect(wrapper.findAll('svg[role=img]')).toHaveLength(2)
      expect(wrapper.text()).toContain('עדיין אין נתונים לקבוצה')
    })

    it('anonymous visitors get no chart and no scorer fetch', async () => {
      mockFetch({ 'GET /api/auth/me': UNAUTHORIZED })
      await router.push('/stats')
      const wrapper = await mountView()
      expect(wrapper.find('svg[role=img]').exists()).toBe(false)
      expect(urls().some((u) => u.includes('scorers'))).toBe(false)
    })
  })
})
