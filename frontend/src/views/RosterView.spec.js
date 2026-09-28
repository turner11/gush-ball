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
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the selected team's players with jersey numbers", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('7')
  })

  it('keeps the existing stats coming-soon message', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('סטטיסטיקות שחקנים יופיעו כאן בקרוב')
  })
})
