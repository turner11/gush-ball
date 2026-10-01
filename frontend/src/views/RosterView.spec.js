import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const PLAYERS = [
  { id: 1, team_id: 1, name: 'יוסי כהן', name_en: null, jersey_number: 7, images: [] },
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

describe('RosterView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/roster', name: 'roster', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the selected team's players with jersey numbers", async () => {
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'GET /api/teams/1/lineups?size=5&sort=top': () => jsonRes([]),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('7')
  })

  it('renders the lineups section', async () => {
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'GET /api/teams/1/lineups?size=5&sort=top': () => jsonRes([]),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('חמישיות')
  })

  const GAME = {
    id: 2,
    team_id: 1,
    scheduled_at: '2026-03-04T18:00:00',
    opponent: { id: 6, name: 'הפועל עבר' },
  }

  it('filters lineups to ?game and the chip clears it', async () => {
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'GET /api/teams/1/games/2': () => jsonRes(GAME),
      'GET /api/teams/1/lineups?size=5&sort=top&game_id=2': () => jsonRes([]),
      'GET /api/teams/1/lineups?size=5&sort=top': () => jsonRes([]),
    })
    await router.push('/roster?game=2')

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    const chip = wrapper.find('a.btn-secondary')
    expect(chip.text()).toContain('נגד הפועל עבר')
    await chip.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({})
    const urls = global.fetch.mock.calls.map(([u]) => u)
    expect(urls).toContain('/api/teams/1/lineups?size=5&sort=top')
  })

  it("drops the filter when the game is not this team's", async () => {
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'GET /api/teams/1/games/2': () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }),
      'GET /api/teams/1/lineups?size=5&sort=top&game_id=2': () => jsonRes([]),
      'GET /api/teams/1/lineups?size=5&sort=top': () => jsonRes([]),
    })
    await router.push('/roster?game=2')

    const { default: RosterView } = await import('./RosterView.vue')
    mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({})
  })
})
