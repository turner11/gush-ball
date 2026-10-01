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

const TEAMS = [
  { id: 1, name: 'א', ibasketball_team_url: 'https://x/1' },
  { id: 2, name: 'ב', ibasketball_league_url: 'https://x/2' },
  { id: 3, name: 'ללא' },
]

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

  it('shows counts and per-team errors from the last finished run', async () => {
    mockFetch({
      'GET /api/sync/status': () =>
        jsonRes({
          running: false,
          finished_at: '2026-09-29T10:00:00Z',
          standings: 8,
          games: 12,
          errors: ['games gush: boom'],
          failed: false,
        }),
    })

    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('8 שורות טבלה, 12 משחקים')
    expect(wrapper.text()).toContain('games gush: boom')
  })

  it('clicking the sync button POSTs /sync/now and shows the running message', async () => {
    mockFetch({
      'GET /api/sync/status': () => jsonRes({ running: false, errors: [] }),
      'GET /api/teams': () => jsonRes(TEAMS),
      'POST /api/sync/now': () => jsonRes({ status: 'started' }, 202),
    })

    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })

    await flushPromises()
    const button = wrapper.findAll('button').find((b) => b.text() === 'סנכרון עכשיו')
    await button.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/sync/now',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('הסנכרון רץ')
  })

  it('a 409 already-running response shows an error message', async () => {
    global.fetch = vi.fn((url) =>
      Promise.resolve(
        url === '/api/sync/status'
          ? jsonRes({ running: false, errors: [] })
          : url === '/api/teams'
          ? jsonRes(TEAMS)
          : { ok: false, status: 409, json: async () => ({ detail: 'Sync already running' }) },
      ),
    )

    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })

    await flushPromises()
    const button = wrapper.findAll('button').find((b) => b.text() === 'סנכרון עכשיו')
    await button.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sync already running')
  })

  const syncButton = (wrapper) => wrapper.findAll('button').find((b) => b.text() === 'סנכרון עכשיו')
  const checkbox = (wrapper, value) =>
    wrapper.findAll('input[type=checkbox]').find((i) => i.element.value === String(value))
  const postBody = () =>
    JSON.parse(global.fetch.mock.calls.find(([url]) => url === '/api/sync/now')[1].body)

  function mockSyncApis() {
    mockFetch({
      'GET /api/sync/status': () => jsonRes({ running: false, errors: [] }),
      'GET /api/teams': () => jsonRes(TEAMS),
      'POST /api/sync/now': () => jsonRes({ status: 'started' }, 202),
    })
  }

  it('full admin: unchecking a kind and a team sends the selection', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })
    await flushPromises()

    await checkbox(wrapper, 'players').setValue(false)
    await checkbox(wrapper, 2).setValue(false)
    await syncButton(wrapper).trigger('click')

    const body = postBody()
    expect(body.kinds.sort()).toEqual(['games', 'standings'])
    expect(body.auto_accept).toBe(true)
    expect(body.team_ids).toEqual([1])
  })

  it('auto accept is checked by default and hidden when games is unchecked', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אישור אוטומטי של משחקים')
    const auto = wrapper.findAll('label').find((l) => l.text().includes('אישור אוטומטי'))
    expect(auto.find('input').element.checked).toBe(true)

    await checkbox(wrapper, 'games').setValue(false)

    expect(wrapper.text()).not.toContain('אישור אוטומטי של משחקים')
  })

  it('team admin sees no team picker and the POST has no team_ids', async () => {
    mockSyncApis()
    ;(await import('../composables/useAuth')).useAuth().user.value = { username: 't', team_id: 1 }
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams', expect.anything())
    expect(wrapper.text()).toContain('הסנכרון יתבצע לקבוצה שלך בלבד')
    await syncButton(wrapper).trigger('click')

    expect(postBody()).not.toHaveProperty('team_ids')
  })

  it('sync button is disabled when nothing is selected to sync', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mount(AdminHomeView, { global: { plugins: [router] } })
    await flushPromises()
    expect(syncButton(wrapper).element.disabled).toBe(false)

    for (const k of ['players', 'games', 'standings']) await checkbox(wrapper, k).setValue(false)
    expect(syncButton(wrapper).element.disabled).toBe(true)

    await checkbox(wrapper, 'games').setValue(true)
    await wrapper.findAll('button').find((b) => b.text() === 'נקה הכל').trigger('click')
    expect(syncButton(wrapper).element.disabled).toBe(true)
  })
})
