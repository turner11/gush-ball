import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const TEAM = { id: 1, name: 'קבוצה א' }

const ROWS = [
  {
    id: 1,
    league_name: 'ליגה א',
    team_name: 'קבוצה א',
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
      'GET /api/teams': () => jsonRes(TEAMS),
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

  it("shows an empty state when no standings row matches the team's name", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/standings': () => jsonRes([ROWS[2]]),
    })

    const { default: StandingsView } = await import('./StandingsView.vue')
    const wrapper = mount(StandingsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין נתוני טבלה עבור קבוצה זו')
  })
})
