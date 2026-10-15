import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א', slug: 'team-a' }]

// The ConfirmDialog's buttons render through an AlertDialog portal teleported to
// document.body, outside the mounted wrapper's own DOM subtree.
function body() {
  return new DOMWrapper(document.body)
}

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const method = options.method || 'GET'
    const key = `${method} ${url}`
    const handler = { 'GET /api/clubs': () => jsonRes([]), ...handlers }[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}

function jsonRes(body, status = 200) {
  return { ok: true, status, json: async () => body }
}

describe('AdminTeamsView', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('clicking מחיקה opens a confirmation dialog and does not call DELETE until confirmed', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView)
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    expect(wrapper.text()).toContain('קבוצה א')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('typing in the search filters the teams list and shows a clear button when nothing matches', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes([...TEAMS, { id: 2, name: 'הפועל', slug: 'hapoel' }]),
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView)
    await flushPromises()

    const input = wrapper.find('input[type="search"]')
    await input.setValue('הפועל')
    expect(wrapper.text()).toContain('הפועל')
    expect(wrapper.text()).not.toContain('קבוצה א')

    await input.setValue('zzz')
    const clear = wrapper.findAll('button').find((b) => b.text() === 'נקה חיפוש')
    await clear.trigger('click')
    expect(wrapper.text()).toContain('הפועל')
    expect(wrapper.text()).toContain('קבוצה א')
  })

  it('confirming the dialog calls DELETE /api/teams/:id and removes the team from the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'DELETE /api/teams/1': () => jsonRes({}),
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { attachTo: document.body })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const confirmButton = body().findAll('button').find((b) => b.text() === 'אישור')
    await confirmButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.text()).not.toContain('קבוצה א')
  })

  it('cancelling the dialog leaves the team in the list and issues no DELETE request', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { attachTo: document.body })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const cancelButton = body().findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('a failed DELETE keeps the team in the list and shows the error', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'DELETE /api/teams/1': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }),
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { attachTo: document.body })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'מחיקה').trigger('click')
    await body().findAll('button').find((b) => b.text() === 'אישור').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.find('[data-testid="list-error"]').exists()).toBe(true)
  })

  it('a failed load shows an error with retry instead of the empty state', async () => {
    mockFetch({ 'GET /api/teams': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }) })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView)
    await flushPromises()

    expect(wrapper.text()).not.toContain('אין קבוצות עדיין.')
    const retry = wrapper.findAll('button').find((b) => b.text() === 'נסו שוב')
    expect(retry).toBeTruthy()

    let finish
    mockFetch({ 'GET /api/teams': () => new Promise((r) => (finish = () => r(jsonRes(TEAMS)))) })
    await retry.trigger('click')
    expect(wrapper.text()).not.toContain('אין קבוצות עדיין.')
    expect(wrapper.find('[aria-hidden="true"].space-y-2').exists()).toBe(true)
    finish()
    await flushPromises()
    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.find('[data-testid="list-error"]').exists()).toBe(false)
  })

  it('links each team to its public page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes([{ id: 1, name: 'קבוצה א', name_en: 'Team A' }]) })
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/:p(.*)*', component: { template: '<div/>' } },
        { path: '/admin/teams/:id', name: 'admin-team-edit', component: { template: '<div/>' } },
        { path: '/admin/teams/import', name: 'admin-teams-import', component: { template: '<div/>' } },
        { path: '/admin/teams/batch', name: 'admin-teams-batch-edit', component: { template: '<div/>' } },
      ],
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('a[href="/team_a"]').exists()).toBe(true)
  })

  it('flags a team with a pending league URL suggestion, linking to its edit form', async () => {
    mockFetch({
      'GET /api/teams': () =>
        jsonRes([
          { id: 1, name: 'קבוצה א', league_url_suggestion: 'https://ibasketball.co.il/league/2026-x/' },
          { id: 2, name: 'הפועל' },
        ]),
    })
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/:p(.*)*', component: { template: '<div/>' } },
        { path: '/admin/teams/:id', name: 'admin-team-edit', component: { template: '<div/>' } },
        { path: '/admin/teams/import', name: 'admin-teams-import', component: { template: '<div/>' } },
        { path: '/admin/teams/batch', name: 'admin-teams-batch-edit', component: { template: '<div/>' } },
      ],
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { global: { plugins: [router] } })
    await flushPromises()

    const badges = wrapper.findAll('.badge-loss')
    expect(badges).toHaveLength(1)
    expect(badges[0].text()).toContain('ליגה חדשה זוהתה')
    expect(wrapper.find('a.badge-loss').attributes('href')).toBe('/admin/teams/1')
  })

  it('shows the club import link to a full admin only', async () => {
    const { useAuth } = await import('../composables/useAuth')
    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/:p(.*)*', component: { template: '<div/>' } },
        { path: '/admin/teams/:id', name: 'admin-team-edit', component: { template: '<div/>' } },
        { path: '/admin/teams/import', name: 'admin-teams-import', component: { template: '<div/>' } },
        { path: '/admin/teams/batch', name: 'admin-teams-batch-edit', component: { template: '<div/>' } },
      ],
    })
    const hasLink = async (me) => {
      mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), 'GET /api/auth/me': () => jsonRes(me) })
      await useAuth().checkSession()
      const wrapper = mount(AdminTeamsView, { global: { plugins: [router] } })
      await flushPromises()
      const hasImport = wrapper.find('a[href="/admin/teams/import"]').exists()
      expect(wrapper.find('a[href="/admin/teams/batch"]').exists()).toBe(hasImport)
      return hasImport
    }

    expect(await hasLink({ id: 1, team_id: null, team_ids: null })).toBe(true)
    expect(await hasLink({ id: 2, team_id: 1, team_ids: [1] })).toBe(false)
  })

  it('shows the clubs section to a full admin only', async () => {
    const { useAuth } = await import('../composables/useAuth')
    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const hasClubs = async (me) => {
      mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), 'GET /api/auth/me': () => jsonRes(me) })
      await useAuth().checkSession()
      const wrapper = mount(AdminTeamsView, { global: { stubs: { RouterLink: true } } })
      await flushPromises()
      return wrapper.text().includes('מועדונים')
    }

    expect(await hasClubs({ id: 1, team_id: null, team_ids: null })).toBe(true)
    expect(await hasClubs({ id: 2, team_id: 1, team_ids: [1] })).toBe(false)
  })
})
