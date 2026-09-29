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
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
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
})
