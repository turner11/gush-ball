import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  })

  it('links the opponent only when it has a source_url', async () => {
    mockFetch({
      'GET /api/teams/1/games': () => jsonRes([FUTURE_GAME, PAST_GAME]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    const links = wrapper.findAll('tbody a')
    expect(links).toHaveLength(1)
    expect(links[0].text()).toBe('מכבי עתיד')
    expect(links[0].attributes('href')).toBe('https://ibasketball.co.il/team/5/')
    expect(links[0].attributes('target')).toBe('_blank')
    expect(wrapper.text()).toContain('הפועל עבר')
  })

  it('renders a Hebrew status label, not the raw enum value', async () => {
    mockFetch({
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
      'GET /api/teams/1/games': () => jsonRes([]),
    })

    const { default: ScheduleView } = await import('./ScheduleView.vue')
    const wrapper = mount(ScheduleView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין משחקים עדיין')
  })
})
