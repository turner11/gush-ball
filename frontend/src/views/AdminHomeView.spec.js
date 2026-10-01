import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
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
    document.body.innerHTML = ''
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
  const mountFull = (AdminHomeView) =>
    mount(AdminHomeView, { global: { plugins: [router] }, attachTo: document.body })
  const body = () => new DOMWrapper(document.body)
  const trigger = (wrapper) => wrapper.find('#sync-teams-trigger')
  async function openTeams(wrapper) {
    await trigger(wrapper).trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }
  const teamItem = (text) =>
    body().findAll('[role=menuitemcheckbox]').find((i) => i.text().trim() === text)
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
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()

    await checkbox(wrapper, 'players').setValue(false)
    await openTeams(wrapper)
    await teamItem('ב').trigger('click')
    await flushPromises()
    await body().trigger('keydown', { key: 'Escape' })
    await flushPromises()
    await syncButton(wrapper).trigger('click')

    const sent = postBody()
    expect(sent.kinds.sort()).toEqual(['games', 'standings'])
    expect(sent.auto_accept).toBe(true)
    expect(sent.team_ids).toEqual([1])
  })

  it('team picker defaults to all teams, select-all is mixed after deselecting one', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()

    expect(trigger(wrapper).text()).toContain('כל הקבוצות')
    await openTeams(wrapper)
    expect(teamItem('בחר הכל').attributes('aria-checked')).toBe('true')
    expect(body().findAll('[role=menuitemcheckbox]')).toHaveLength(3)

    await teamItem('ב').trigger('click')
    await flushPromises()
    expect(teamItem('בחר הכל').attributes('aria-checked')).toBe('mixed')
    expect(trigger(wrapper).text()).toContain('א')
    expect(body().findAll('[role=menuitemcheckbox]')).toHaveLength(3)
  })

  it('open team menu is labelled by an existing element', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()
    await openTeams(wrapper)
    const labelId = body().find('[role=menu]').attributes('aria-labelledby')
    expect(document.getElementById(labelId)).not.toBeNull()
  })

  it('select all toggles every team on and off', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()
    await openTeams(wrapper)

    await teamItem('ב').trigger('click')
    await flushPromises()
    await teamItem('בחר הכל').trigger('click')
    await flushPromises()
    const checked = () => body().findAll('[role=menuitemcheckbox]').map((i) => i.attributes('aria-checked'))
    expect(checked()).toEqual(['true', 'true', 'true'])

    await teamItem('בחר הכל').trigger('click')
    await flushPromises()
    expect(checked()).toEqual(['false', 'false', 'false'])
    expect(trigger(wrapper).text()).toContain('לא נבחרו קבוצות')
    expect(syncButton(wrapper).element.disabled).toBe(true)
  })

  it('full admin with no syncable teams sees an empty state', async () => {
    mockFetch({
      'GET /api/sync/status': () => jsonRes({ running: false, errors: [] }),
      'GET /api/teams': () => jsonRes([{ id: 3, name: 'ללא' }]),
    })
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()

    expect(wrapper.text()).toContain('אין קבוצות עם קישור ל-ibasketball')
    expect(trigger(wrapper).element.disabled).toBe(true)
    expect(syncButton(wrapper).element.disabled).toBe(true)
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
    expect(wrapper.find('#sync-teams-trigger').exists()).toBe(false)
  })

  it('sync button is disabled when nothing is selected to sync', async () => {
    mockSyncApis()
    const { default: AdminHomeView } = await import('./AdminHomeView.vue')
    const wrapper = mountFull(AdminHomeView)
    await flushPromises()
    expect(syncButton(wrapper).element.disabled).toBe(false)

    for (const k of ['players', 'games', 'standings']) await checkbox(wrapper, k).setValue(false)
    expect(syncButton(wrapper).element.disabled).toBe(true)

    await checkbox(wrapper, 'games').setValue(true)
    await openTeams(wrapper)
    await teamItem('בחר הכל').trigger('click')
    await flushPromises()
    expect(syncButton(wrapper).element.disabled).toBe(true)
  })
})
