import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const PLAYERS = [{ id: 10, team_id: 1, name: 'יוסי', name_en: null, jersey_number: 7, images: [] }]

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

describe('AdminPlayersView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/:slug/admin/players', name: 'admin-players', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads teams + the selected team's players and renders each player's name/jersey number", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי')
    expect(wrapper.text()).toContain('7')
  })

  it('ignores a late response for a team that is no longer selected', async () => {
    let resolveFirst
    const first = new Promise((r) => (resolveFirst = r))
    const other = [{ id: 30, team_id: 2, name: 'עמית', name_en: null, jersey_number: 3, images: [] }]
    global.fetch = vi.fn((url) => {
      if (url === '/api/teams') return Promise.resolve(jsonRes(TEAMS))
      if (url === '/api/teams/1/players') return first
      if (url === '/api/teams/2/players') return Promise.resolve(jsonRes(other))
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()
    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()
    resolveFirst(jsonRes(PLAYERS))
    await flushPromises()

    expect(wrapper.text()).toContain('עמית')
    expect(wrapper.text()).not.toContain('יוסי')
  })

  it('submitting the add-player form POSTs and the new player appears in the list', async () => {
    const created = { id: 20, team_id: 1, name: 'דני', name_en: null, jersey_number: 9, images: [] }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'POST /api/teams/1/players': () => jsonRes(created, 201),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#player-name').setValue('דני')
    await wrapper.find('#player-jersey-number').setValue('9')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/players',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('דני')
  })

  it('uploading a player image fills the image url input and הוסף תמונה posts it', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/p.png' }),
      'POST /api/players/10/images': () => jsonRes({ id: 5, url: 'https://cdn/p.png' }, 201),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['a'], 'p.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('input[type="url"]').element.value).toBe('https://cdn/p.png')

    await wrapper.findAll('button').find((b) => b.text() === 'הוסף תמונה').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/players/10/images',
      expect.objectContaining({ body: JSON.stringify({ url: 'https://cdn/p.png' }) }),
    )
  })

  it('clicking edit, changing a field and submitting PATCHes and updates the list', async () => {
    const updated = { id: 10, team_id: 1, name: 'יוסי', name_en: null, jersey_number: 23, images: [] }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'PATCH /api/teams/1/players/10': () => jsonRes(updated),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    const editButton = wrapper.findAll('button').find((b) => b.text() === 'ערוך')
    await editButton.trigger('click')
    await wrapper.find('#player-jersey-number').setValue('23')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/players/10',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.text()).toContain('23')
  })

  it('clicking delete on a row DELETEs and removes that row from the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'DELETE /api/teams/1/players/10': () => ({ ok: true, status: 204, json: vi.fn() }),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי')

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחק')
    await deleteButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('יוסי')
  })

  it('a failed add-image request sets an error and leaves the image list unchanged', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'POST /api/players/10/images': () => errorRes(),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('input[placeholder="כתובת תמונה"]').setValue('https://example.com/x.png')
    const addImageButton = wrapper.findAll('button').find((b) => b.text() === 'הוסף תמונה')
    await addImageButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('שגיאה בהוספת תמונה, נסה שוב')
    expect(wrapper.findAll('li')).toHaveLength(0)
  })

  it('shows deleted players on demand and restoring moves the player back to the list', async () => {
    const gone = { id: 11, team_id: 1, name: 'דני', name_en: null, jersey_number: 9, images: [] }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/players': () => jsonRes([{ id: 10, team_id: 1, name: 'יוסי', name_en: null, jersey_number: 7, images: [] }]),
      'GET /api/teams/1/players/deleted': () => jsonRes([gone]),
      'POST /api/teams/1/players/11/restore': () => jsonRes(gone),
    })

    const { default: AdminPlayersView } = await import('./AdminPlayersView.vue')
    const wrapper = mount(AdminPlayersView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('דני')

    await wrapper.findAll('button').find((b) => b.text() === 'שחקנים שנמחקו').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('דני')

    await wrapper.findAll('button').find((b) => b.text() === 'שחזר').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/players/11/restore',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'שחזר')).toBe(false)
    expect(wrapper.findAll('tbody')[0].text()).toContain('דני')
  })

  it("changing the team select navigates to that team's URL", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes([{ id: 1, name: 'קבוצה א', name_en: 'Team A' }, { id: 2, name: 'קבוצה ב', name_en: 'Team B' }]),
      'GET /api/teams/1/players': () => jsonRes([]),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
    })
    await router.push('/team_a/admin/players')

    const { default: View } = await import('./AdminPlayersView.vue')
    const wrapper = mount(View, { global: { plugins: [router] } })
    await flushPromises()
    await wrapper.find('#team-select').setValue('team_b')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_b/admin/players')
  })
})
