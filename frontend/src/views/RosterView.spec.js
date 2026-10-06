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
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('7')
  })

  it('roster page no longer renders lineups', async () => {
    mockFetch({ 'GET /api/teams/1/players': () => jsonRes(PLAYERS) })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(global.fetch.mock.calls.some(([u]) => u.includes('lineups'))).toBe(false)
    expect(wrapper.text()).not.toContain('חמישיות')
    expect(wrapper.find('#lineups').exists()).toBe(false)
  })

  it('ignores a late response for a team that is no longer selected', async () => {
    let resolveFirst
    const first = new Promise((r) => (resolveFirst = r))
    const other = [{ id: 30, team_id: 2, name: 'עמית', name_en: null, jersey_number: 3, images: [] }]
    global.fetch = vi.fn((url) => {
      if (url === '/api/teams/1/players') return first
      if (url === '/api/teams/2/players') return Promise.resolve(jsonRes(other))
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()
    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()
    resolveFirst(jsonRes(PLAYERS))
    await flushPromises()

    expect(wrapper.text()).toContain('עמית')
    expect(wrapper.text()).not.toContain('יוסי')
  })
})
