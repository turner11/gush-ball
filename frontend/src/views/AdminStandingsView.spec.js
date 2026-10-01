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

const MULTI = [
  ...ROWS,
  { ...ROWS[0], id: 2, team_name: 'קבוצה ב', rank: 2, source_url: 'https://x.il/team/b' },
  { ...ROWS[0], id: 3, league_name: 'ליגה ב', team_name: 'קבוצה ג', source_url: 'https://x.il/team/c' },
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

function errorRes(statusText = 'Server Error') {
  return {
    ok: false,
    statusText,
    json: async () => {
      throw new Error('no body')
    },
  }
}

describe('AdminStandingsView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/admin', name: 'admin-home', component: { template: '<div/>' } },
      ],
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

  it('clicking edit, changing a field and submitting PATCHes and updates the list', async () => {
    const updated = {
      id: 1,
      league_name: 'ליגה א',
      team_name: 'קבוצה א',
      rank: 1,
      played: 11,
      won: 9,
      lost: 2,
      points_for: 880,
      points_against: 750,
      points: 18,
    }
    mockFetch({
      'GET /api/standings': () => jsonRes(ROWS),
      'PATCH /api/standings/1': () => jsonRes(updated),
    })

    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const editButton = wrapper.findAll('button').find((b) => b.text() === 'ערוך')
    await editButton.trigger('click')
    await wrapper.find('#standing-played').setValue('11')
    await wrapper.find('#standing-won').setValue('9')
    await wrapper.find('#standing-points').setValue('18')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/standings/1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.text()).toContain('18')
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

  it('a failed DELETE sets an error and keeps the row in the list', async () => {
    mockFetch({
      'GET /api/standings': () => jsonRes(ROWS),
      'DELETE /api/standings/1': () => errorRes(),
    })

    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחק')
    await deleteButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('שגיאה במחיקת השורה, נסה שוב')
    expect(wrapper.text()).toContain('קבוצה א')
  })
  async function mountView() {
    const { default: AdminStandingsView } = await import('./AdminStandingsView.vue')
    const wrapper = mount(AdminStandingsView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  async function asTeamAdmin(teamUrl) {
    const { useAuth } = await import('../composables/useAuth.js')
    useAuth().user.value = { username: 't', team_id: 1 }
    mockFetch({
      'GET /api/standings': () => jsonRes(MULTI),
      'GET /api/teams/1': () => jsonRes({ id: 1, name: 'x', ibasketball_team_url: teamUrl }),
    })
    return mountView()
  }

  it("shows only the selected league's rows and switches on select", async () => {
    mockFetch({ 'GET /api/standings': () => jsonRes(MULTI) })
    const wrapper = await mountView()

    const options = wrapper.findAll('#league-select option').map((o) => o.text())
    expect(options).toEqual(['ליגה א', 'ליגה ב'])
    expect(wrapper.find('table').text()).toContain('קבוצה ב')
    expect(wrapper.find('table').text()).not.toContain('קבוצה ג')

    await wrapper.find('#league-select').setValue('ליגה ב')
    expect(wrapper.find('table').text()).toContain('קבוצה ג')
    expect(wrapper.find('table').text()).not.toContain('קבוצה ב')
  })

  it('new-row form defaults the league to the selected league', async () => {
    mockFetch({ 'GET /api/standings': () => jsonRes(MULTI) })
    const wrapper = await mountView()
    await wrapper.find('#league-select').setValue('ליגה ב')
    expect(wrapper.find('#standing-league-name').element.value).toBe('ליגה ב')
  })

  it("team admin sees only their team's leagues, read-only", async () => {
    const wrapper = await asTeamAdmin('https://x.il/team/c/')
    expect(wrapper.findAll('#league-select option').map((o) => o.text())).toEqual(['ליגה ב'])
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).not.toContain('ערוך')
    expect(labels).not.toContain('מחק')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('team admin with no matching row sees the sync empty state', async () => {
    const wrapper = await asTeamAdmin('https://x.il/team/none')
    expect(wrapper.text()).toContain('לא נמצאה טבלת ליגה עבור הקבוצה')
    expect(wrapper.find('a[href="/admin"]').exists()).toBe(true)
  })

  it('a failed initial load shows an error', async () => {
    mockFetch({ 'GET /api/standings': () => errorRes() })
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('שגיאה בטעינת הטבלה, נסה שוב')
  })
})
