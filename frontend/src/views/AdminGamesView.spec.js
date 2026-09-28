import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const GAMES = [
  {
    id: 100,
    team_id: 1,
    is_home: true,
    scheduled_at: '2026-10-01T18:00:00',
    status: 'scheduled',
    team_score: null,
    opponent_score: null,
    description: null,
    opponent: { id: 5, name: 'מכבי', name_en: null, logo_url: null, source_url: null },
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

function errorRes(statusText = 'Server Error') {
  return {
    ok: false,
    statusText,
    json: async () => {
      throw new Error('no body')
    },
  }
}

describe('AdminGamesView', () => {
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

  it("loads and renders the selected team's games (opponent, date, status)", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('מכבי')
    expect(wrapper.text()).toContain('2026-10-01')
    expect(wrapper.text()).toContain('scheduled')
  })

  it('submitting the add-game form POSTs the payload and the new game appears in the list', async () => {
    const created = {
      id: 200,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-11-05T20:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 6, name: 'הפועל', name_en: null, logo_url: null, source_url: null },
    }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'POST /api/teams/1/games': () => jsonRes(created, 201),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#game-opponent-name').setValue('הפועל')
    await wrapper.find('#game-scheduled-at').setValue('2026-11-05T20:00')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.text()).toContain('הפועל')
  })

  it('clicking edit, changing a field and submitting PATCHes and updates the list', async () => {
    const updated = {
      id: 100,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-10-01T18:00:00',
      status: 'final',
      team_score: 80,
      opponent_score: 70,
      description: null,
      opponent: { id: 5, name: 'מכבי', name_en: null, logo_url: null, source_url: null },
    }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'PATCH /api/teams/1/games/100': () => jsonRes(updated),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    const editButton = wrapper.findAll('button').find((b) => b.text() === 'ערוך')
    await editButton.trigger('click')
    await wrapper.find('#game-status').setValue('final')
    await wrapper.find('#game-team-score').setValue('80')
    await wrapper.find('#game-opponent-score').setValue('70')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games/100',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.text()).toContain('final')
    expect(wrapper.text()).toContain('80')
  })

  it('delete removes a game from the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'DELETE /api/teams/1/games/100': () => ({ ok: true, status: 204, json: vi.fn() }),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('מכבי')

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחק')
    await deleteButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('מכבי')
  })

  it('a failed POST sets an error and does not add the game to the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'POST /api/teams/1/games': () => errorRes(),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#game-opponent-name').setValue('קבוצת רפאים')
    await wrapper.find('#game-scheduled-at').setValue('2026-11-05T20:00')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('שגיאה בשמירת המשחק, נסה שוב')
    expect(wrapper.text()).not.toContain('קבוצת רפאים')
  })
})
