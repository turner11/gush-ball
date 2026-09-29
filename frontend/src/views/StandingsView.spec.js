import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const TEAM = { id: 1, name: 'קבוצה א', logo_url: 'https://l/team.png' }

const ROWS = [
  {
    id: 1,
    league_name: 'ליגה א',
    team_name: 'קבוצה א',
    source_url: 'https://ibasketball.co.il/team/1/',
    rank: 1,
    played: 10,
    won: 8,
    lost: 2,
    points_for: 800,
    points_against: 700,
    points: 16,
  },
  {
    id: 2,
    league_name: 'ליגה א',
    team_name: 'קבוצה ב',
    logo_url: 'https://l/b.png',
    rank: 2,
    played: 10,
    won: 6,
    lost: 4,
    points_for: 750,
    points_against: 720,
    points: 12,
  },
  {
    id: 3,
    league_name: 'ליגה ב',
    team_name: 'קבוצה ג',
    rank: 1,
    played: 10,
    won: 9,
    lost: 1,
    points_for: 900,
    points_against: 600,
    points: 18,
  },
]

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

describe('StandingsView', () => {
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

  it("renders the selected team's league table, highlighting its own row", async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/standings': () => jsonRes(ROWS),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('ליגה א')
    expect(text).toContain('קבוצה א')
    expect(text).toContain('קבוצה ב')
    expect(text).not.toContain('קבוצה ג')
  })

  it('shows the team logo on the own row and the opponent logo on others', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/standings': () => jsonRes(ROWS),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const srcs = wrapper.findAll('tbody img').map((i) => i.attributes('src'))
    expect(srcs).toEqual(['https://l/team.png', 'https://l/b.png'])
  })

  it('links team names to ibasketball, including the club own row', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/standings': () => jsonRes(ROWS),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const links = wrapper.findAll('tbody a')
    expect(links).toHaveLength(1)
    expect(links[0].attributes('href')).toBe('https://ibasketball.co.il/team/1/')
    expect(links[0].text()).toBe('קבוצה א')
    expect(links[0].attributes('rel')).toContain('noopener')
  })

  it("shows an empty state when no standings row matches the team's name", async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/standings': () => jsonRes([ROWS[2]]),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין נתוני טבלה עבור קבוצה זו')
  })

  it('matches the own row by team URL when names differ (encoded vs raw Hebrew)', async () => {
    const rows = [
      { ...ROWS[0], team_name: 'אליצור ג.ע. אפרת', source_url: 'https://ibasketball.co.il/team/13638-%D7%90%D7%9C%D7%99%D7%A6%D7%95%D7%A8/' },
      ROWS[1],
    ]
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, ibasketball_team_url: 'https://ibasketball.co.il/team/13638-אליצור' }),
      'GET /api/standings': () => jsonRes(rows),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const own = wrapper.findAll('tbody tr').filter((tr) => tr.classes().includes('font-bold'))
    expect(own).toHaveLength(1)
    expect(own[0].text()).toContain('אליצור ג.ע. אפרת')
  })

  it('does not throw on a malformed (truncated) team URL', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, ibasketball_team_url: 'https://ibasketball.co.il/team/13638-%D7%90%D7/' }),
      'GET /api/standings': () => jsonRes(ROWS),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')
  })

  it('falls back to the name when both URLs are set but differ', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, ibasketball_team_url: 'http://ibasketball.co.il/team/999/' }),
      'GET /api/standings': () => jsonRes(ROWS),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const own = wrapper.findAll('tbody tr').filter((tr) => tr.classes().includes('font-bold'))
    expect(own).toHaveLength(1)
    expect(own[0].text()).toContain('קבוצה א')
  })
})
