import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatGameDate } from '../lib/format'

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
  return { ok: true, status, json: async () => structuredClone(body) } // the view mutates rows in place
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
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/stats', name: 'stats', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads and renders the selected team's games (opponent, date, status)", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('מכבי')
    expect(wrapper.text()).toContain(formatGameDate('2026-10-01T18:00:00').time)
    expect(wrapper.text()).toContain('מתוכנן')
  })

  it('clears the list and shows the error in the list area when loading games fails', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => errorRes(),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.find('form').text()).not.toContain('שגיאה בטעינת המשחקים')
    expect(wrapper.find('[role="alert"]').text()).toBe('שגיאה בטעינת המשחקים')
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
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
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
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
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
    expect(wrapper.text()).toContain('הסתיים')
    expect(wrapper.text()).toContain('80')
  })

  it('delete removes a game from the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
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
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
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

  it('renders pending-review games with an approve button', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
    }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('הפועל ירושלים')
    expect(wrapper.findAll('button').some((b) => b.text() === 'אשר')).toBe(true)
  })

  it('editing a pending game via the shared edit button moves it into the main list, not pending', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
    }
    const updated = { ...pending, status: 'final', team_score: 90, opponent_score: 85 }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
      'PATCH /api/teams/1/games/300': () => jsonRes(updated),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    const editButton = wrapper.findAll('button').find((b) => b.text() === 'ערוך')
    await editButton.trigger('click')
    await wrapper.find('#game-status').setValue('final')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games/300',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'אשר')).toBe(false)
    const rows = wrapper.findAll('ol > li')
    expect(rows[rows.length - 1].text()).toContain('הפועל ירושלים')
  })

  it('clicking approve POSTs to the approve endpoint and removes the game from pending', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
    }
    const approved = { ...pending, needs_review: false }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
      'POST /api/teams/1/games/300/approve': () => jsonRes(approved),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    const approveButton = wrapper.findAll('button').find((b) => b.text() === 'אשר')
    await approveButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games/300/approve',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'אשר')).toBe(false)
  })

  it('renders a scrape suggestion diff with accept/reject instead of approve', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
      scrape_suggestion: { team_score: 90 },
    }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('90')
    expect(wrapper.findAll('button').some((b) => b.text() === 'קבל עדכון')).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === 'דחה')).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === 'אשר')).toBe(false)
  })

  it('accepting a suggestion POSTs to accept and removes it from pending', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
      scrape_suggestion: { team_score: 90 },
    }
    const accepted = { ...pending, team_score: 90, scrape_suggestion: null }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
      'POST /api/teams/1/games/300/suggestion/accept': () => jsonRes(accepted),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    const acceptButton = wrapper.findAll('button').find((b) => b.text() === 'קבל עדכון')
    await acceptButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games/300/suggestion/accept',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'קבל עדכון')).toBe(false)
  })

  it('rejecting a suggestion POSTs to reject and removes it from pending', async () => {
    const pending = {
      id: 300,
      team_id: 1,
      is_home: true,
      scheduled_at: '2026-12-01T18:00:00',
      status: 'scheduled',
      team_score: null,
      opponent_score: null,
      description: null,
      opponent: { id: 7, name: 'הפועל ירושלים', name_en: null, logo_url: null, source_url: null },
      scrape_suggestion: { team_score: 90 },
    }
    const rejected = { ...pending, scrape_suggestion: { team_score: 90 } }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([pending]),
      'POST /api/teams/1/games/300/suggestion/reject': () => jsonRes(rejected),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    const rejectButton = wrapper.findAll('button').find((b) => b.text() === 'דחה')
    await rejectButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/games/300/suggestion/reject',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.findAll('button').some((b) => b.text() === 'דחה')).toBe(false)
  })

  it('editing a game and clicking load stats POSTs the url and shows the count', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
      'POST /api/teams/1/games/100/stats': () => jsonRes({ stats_url: 'http://s', snapshots: 12 }),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'ערוך').trigger('click')
    await wrapper.find('#stats-url').setValue('http://s')
    await wrapper.findAll('button').find((b) => b.text() === 'טען סטטיסטיקה').trigger('click')
    await flushPromises()

    const call = global.fetch.mock.calls.find(([u]) => u === '/api/teams/1/games/100/stats')
    expect(JSON.parse(call[1].body)).toEqual({ url: 'http://s' })
    expect(wrapper.text()).toContain('נטענו 12 רשומות')
    expect(wrapper.text()).not.toContain('כבר יש נתונים')
    expect(wrapper.find('a[href="/stats?game=100"]').exists()).toBe(true)
  })

  it('shows the server error when loading stats fails', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes(GAMES),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
      'POST /api/teams/1/games/100/stats': () => ({
        ok: false,
        statusText: 'x',
        json: async () => ({ detail: 'Failed to load stats sheet: boom' }),
      }),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'ערוך').trigger('click')
    await wrapper.findAll('button').find((b) => b.text() === 'טען סטטיסטיקה').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to load stats sheet: boom')
  })

  it("a row links to the game's lineups when has_stats", async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes([{ ...GAMES[0], has_stats: true }, { ...GAMES[0], id: 101, has_stats: false }]),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
    })

    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('a[href="/stats?game=100"]')).toHaveLength(1)
    expect(wrapper.find('a[href^="/stats?game=101"]').exists()).toBe(false)
  })

  it('games render sorted by date regardless of API order, and stay sorted after an edit', async () => {
    const early = { ...GAMES[0], id: 1, scheduled_at: '2026-10-01T18:00:00', opponent: { ...GAMES[0].opponent, name: 'ראשון' } }
    const late = { ...GAMES[0], id: 2, scheduled_at: '2026-11-01T18:00:00', opponent: { ...GAMES[0].opponent, name: 'שני' } }
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes([late, early]),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
      'PATCH /api/teams/1/games/1': () => jsonRes({ ...early, scheduled_at: '2026-12-01T18:00:00' }),
    })
    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()
    const names = () => wrapper.findAll('ol > li').map((li) => li.text().match(/ראשון|שני/)[0])
    expect(names()).toEqual(['ראשון', 'שני'])

    await wrapper.findAll('button').find((b) => b.text() === 'ערוך').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(names()).toEqual(['שני', 'ראשון'])
  })

  it('shows an empty state when the team has no games', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/teams/1/games': () => jsonRes([]),
      'GET /api/teams/1/games/pending-review': () => jsonRes([]),
    })
    const { default: AdminGamesView } = await import('./AdminGamesView.vue')
    const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.find('.empty-state').text()).toContain('אין משחקים')
  })

  describe('live stats flow', () => {
    const SHEET = 'https://docs.google.com/spreadsheets/d/X/edit'
    const USER = {
      username: 'a',
      team_id: null,
      stats_app_url: 'https://app.streamlit.app',
      stats_template_url: 'https://docs.google.com/spreadsheets/d/T/edit?usp=sharing',
    }

    async function mountEditing(extra = {}, game = GAMES[0]) {
      mockFetch({
        'GET /api/teams': () => jsonRes(TEAMS),
        'GET /api/teams/1/games': () => jsonRes([game]),
        'GET /api/teams/1/games/pending-review': () => jsonRes([]),
        ...extra,
      })
      ;(await import('../composables/useAuth')).useAuth().user.value = USER
      const { default: AdminGamesView } = await import('./AdminGamesView.vue')
      const wrapper = mount(AdminGamesView, { global: { plugins: [router] } })
      await flushPromises()
      await wrapper.findAll('button').find((b) => b.text() === 'ערוך').trigger('click')
      return wrapper
    }

    it('edit starts the stats field with the saved stats_url', async () => {
      const wrapper = await mountEditing({}, { ...GAMES[0], stats_url: SHEET })
      expect(wrapper.find('#stats-url').element.value).toBe(SHEET)
    })

    it('shows a template link rewritten to /copy', async () => {
      const wrapper = await mountEditing()
      const link = wrapper.find('a[href="https://docs.google.com/spreadsheets/d/T/copy"]')
      expect(link.exists()).toBe(true)
      expect(link.attributes('target')).toBe('_blank')
    })

    it('hides the template hint when no template is configured', async () => {
      const wrapper = await mountEditing()
      expect(wrapper.text()).toContain('צרו גיליון מהתבנית')
      ;(await import('../composables/useAuth')).useAuth().user.value = { ...USER, stats_template_url: '' }
      await flushPromises()
      expect(wrapper.text()).not.toContain('צרו גיליון מהתבנית')
    })

    it('hides the template link when the configured value is not a sheet', async () => {
      const wrapper = await mountEditing()
      ;(await import('../composables/useAuth')).useAuth().user.value = {
        ...USER,
        stats_template_url: 'STATS_TEMPLATE_URL=https://docs.google.com/spreadsheets/d/T',
      }
      await flushPromises()
      expect(wrapper.find('a[href*="STATS_TEMPLATE_URL"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('צרו גיליון מהתבנית')
    })

    it('clearing the stats field and saving PATCHes stats_url: null and drops the live link', async () => {
      const wrapper = await mountEditing(
        { 'PATCH /api/teams/1/games/100': () => jsonRes({ ...GAMES[0], stats_url: null }) },
        { ...GAMES[0], stats_url: SHEET },
      )
      expect(wrapper.find('a[href^="https://app.streamlit.app"]').exists()).toBe(true)
      await wrapper.find('#stats-url').setValue('')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      const patch = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      expect(JSON.parse(patch[1].body).stats_url).toBeNull()
      expect(wrapper.find('a[href^="https://app.streamlit.app"]').exists()).toBe(false)
    })

    it('saving sends the typed stats link', async () => {
      const wrapper = await mountEditing({ 'PATCH /api/teams/1/games/100': () => jsonRes(GAMES[0]) })
      await wrapper.find('#stats-url').setValue(` ${SHEET} `)
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      const patch = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      expect(JSON.parse(patch[1].body).stats_url).toBe(SHEET)
    })

    it('stats field accepts a bare sheet id without blocking save', async () => {
      const wrapper = await mountEditing()
      await wrapper.find('#stats-url').setValue('1xvlTs0ry_f-jg3iRN2wdiwM7v1YMiRC7oJwI6MDGb')
      expect(wrapper.find('form').element.checkValidity()).toBe(true)
    })

    describe('deleting stats', () => {
      const DELETE = 'DELETE /api/teams/1/games/100/stats'
      const deleteCalls = () => global.fetch.mock.calls.filter(([, o]) => o?.method === 'DELETE')
      const deleteButton = (wrapper) => wrapper.findAll('button').find((b) => b.text() === 'מחק סטטיסטיקה')

      async function askToDelete() {
        const wrapper = await mountEditing(
          { [DELETE]: () => ({ ok: true, status: 204 }) },
          { ...GAMES[0], has_stats: true, stats_url: SHEET },
        )
        await deleteButton(wrapper).trigger('click')
        return wrapper
      }
      const alertButton = (wrapper, label) => wrapper.findAll('[role="alert"] button').find((b) => b.text() === label)

      it('delete asks first and cancel does not call the API', async () => {
        const wrapper = await askToDelete()
        expect(wrapper.find('[role="alert"]').text()).toContain('למחוק את כל נתוני')

        await alertButton(wrapper, 'ביטול').trigger('click')
        await flushPromises()

        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        expect(deleteCalls()).toHaveLength(0)
      })

      it('confirming מחק deletes and hides the button', async () => {
        const wrapper = await askToDelete()
        await alertButton(wrapper, 'מחק').trigger('click')
        await flushPromises()

        expect(deleteCalls()).toHaveLength(1)
        expect(wrapper.text()).toContain('הסטטיסטיקה נמחקה')
        expect(deleteButton(wrapper)).toBeUndefined()
      })
    })

    describe('when the game already has stats', () => {
      const POST = 'POST /api/teams/1/games/100/stats'
      const statsCalls = () => global.fetch.mock.calls.filter(([u]) => u === '/api/teams/1/games/100/stats')

      async function askToReplace() {
        const wrapper = await mountEditing(
          { [POST]: () => jsonRes({ stats_url: SHEET, snapshots: 5 }) },
          { ...GAMES[0], has_stats: true, stats_url: SHEET },
        )
        await wrapper.findAll('button').find((b) => b.text() === 'טען סטטיסטיקה').trigger('click')
        return wrapper
      }
      const alertButton = (wrapper, label) => wrapper.findAll('[role="alert"] button').find((b) => b.text() === label)

      it('load asks first and cancel does not call the API', async () => {
        const wrapper = await askToReplace()
        expect(wrapper.find('[role="alert"]').text()).toContain('למשחק זה כבר יש נתונים')

        await alertButton(wrapper, 'ביטול').trigger('click')
        await flushPromises()

        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        expect(statsCalls()).toHaveLength(0)
      })

      it('confirming החלף loads the sheet', async () => {
        const wrapper = await askToReplace()
        const focus = vi.spyOn(HTMLElement.prototype, 'focus')
        await alertButton(wrapper, 'החלף').trigger('click')
        await flushPromises()

        expect(focus.mock.contexts.some((el) => el.textContent === 'טען סטטיסטיקה')).toBe(true)
        focus.mockRestore()

        expect(statsCalls()).toHaveLength(1)
        expect(wrapper.text()).toContain('נטענו 5 רשומות')
      })
    })

    it('loading an empty sheet says it was saved and gives the row a live link', async () => {
      const wrapper = await mountEditing({
        'POST /api/teams/1/games/100/stats': () => jsonRes({ stats_url: SHEET, snapshots: 0 }),
      })
      await wrapper.find('#stats-url').setValue(SHEET)
      await wrapper.findAll('button').find((b) => b.text() === 'טען סטטיסטיקה').trigger('click')
      await flushPromises()

      expect(wrapper.text()).toContain('הקישור נשמר')
      expect(wrapper.text()).not.toContain('נטענו 0')
      expect(wrapper.find('a[target="_blank"][href^="https://app.streamlit.app"]').exists()).toBe(true)
    })
  })
})
