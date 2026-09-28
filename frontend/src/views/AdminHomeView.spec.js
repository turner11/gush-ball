import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('AdminHomeView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/admin/players', component: { template: '<div/>' } },
        { path: '/admin/games', component: { template: '<div/>' } },
        { path: '/admin/standings', component: { template: '<div/>' } },
        { path: '/admin/teams', name: 'admin-teams', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clicking the sync button POSTs /sync/now and shows a started message', async () => {
    mockFetch({ 'POST /api/sync/now': () => jsonRes({ status: 'started' }, 202) })

    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })

    const button = wrapper.findAll('button').find((b) => b.text() === 'סנכרון עכשיו')
    await button.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sync/now',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('הסנכרון התחיל')
  })

  it('a 409 already-running response shows an error message', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Sync already running' }),
      }),
    )

    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })

    const button = wrapper.findAll('button').find((b) => b.text() === 'סנכרון עכשיו')
    await button.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sync already running')
  })
})
