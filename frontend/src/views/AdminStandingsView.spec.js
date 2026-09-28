import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('AdminStandingsView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads and renders standing rows', async () => {
    mockFetch({ 'GET /api/standings': () => jsonRes(ROWS) })

    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('ליגה א')
    expect(wrapper.text()).toContain('קבוצה א')
  })

  it('submitting the add-row form POSTs the payload and the new row appears in the list', async () => {
    const created = {
      id: 2,
      league_name: 'ליגה א',
      team_name: 'קבוצה ב',
      rank: 2,
      played: 10,
      won: 6,
      lost: 4,
      points_for: 750,
      points_against: 700,
      points: 12,
    }
    mockFetch({
      'GET /api/standings': () => jsonRes(ROWS),
      'POST /api/standings': () => jsonRes(created, 201),
    })

    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#standing-league-name').setValue('ליגה א')
    await wrapper.find('#standing-team-name').setValue('קבוצה ב')
    await wrapper.find('#standing-rank').setValue('2')
    await wrapper.find('#standing-played').setValue('10')
    await wrapper.find('#standing-won').setValue('6')
    await wrapper.find('#standing-lost').setValue('4')
    await wrapper.find('#standing-points-for').setValue('750')
    await wrapper.find('#standing-points-against').setValue('700')
    await wrapper.find('#standing-points').setValue('12')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/standings',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('קבוצה ב')
  })

  it('delete removes a row from the list', async () => {
    mockFetch({
      'GET /api/standings': () => jsonRes(ROWS),
      'DELETE /api/standings/1': () => ({ ok: true, status: 204, json: vi.fn() }),
    })

    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחק')
    await deleteButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('קבוצה א')
  })
})
