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
      routes: [{ path: '/', component: { template: '<div/>' } }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('splits games into upcoming and past sections by scheduled_at', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'קבוצה א', ibasketball_team_url: null }),
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    const text = wrapper.text()
    const upcomingIdx = text.indexOf('מכבי עתיד')
    const pastIdx = text.indexOf('הפועל עבר')
    expect(upcomingIdx).toBeGreaterThan(-1)
    expect(pastIdx).toBeGreaterThan(-1)
    expect(upcomingIdx).toBeLessThan(pastIdx)
    expect(text).toContain(formatGameDate('2030-05-01T18:00:00').time)
    expect(text).not.toContain('2030-05-01T18:00:00')
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
    const scores = wrapper.findAll('span.tabular-nums.text-xl').map((s) => s.text())
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

    const links = wrapper.findAll('ol a')
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
    expect(link.text()).toBe('קבוצה א')
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
      const row = (await mountWith(ADDR)).findAll('li')[0]
      expect(row.find(`a[href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDR)}"]`).exists()).toBe(true)
      expect(row.find(`a[href^="https://waze.com/ul?q=${encodeURIComponent(ADDR)}"]`).exists()).toBe(true)
    })

    it('hides location links on away games and when team has no address', async () => {
      const away = (await mountWith(ADDR)).findAll('li')[1]
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

      const away = wrapper.findAll('li')[1]
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
      const [home, away] = await rows()
      const h = home.text()
      const a = away.text()
      expect(h.indexOf('קבוצה א')).toBeGreaterThan(-1)
      expect(h.indexOf('קבוצה א')).toBeLessThan(h.indexOf('מכבי עתיד'))
      expect(a.indexOf('הפועל עבר')).toBeLessThan(a.indexOf('קבוצה א'))
    })

    it('marks home and away games with a badge', async () => {
      const [home, away] = await rows()
      expect(home.findAll('.badge').map((b) => b.text())).toContain('בית')
      expect(away.findAll('.badge').map((b) => b.text())).toContain('חוץ')
    })
  })
})
