import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const PLAYERS = [
  { id: 1, team_id: 1, name: 'יוסי כהן', name_en: null, jersey_number: 7, images: [] },
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

describe('RosterView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/roster', name: 'roster', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the selected team's players with jersey numbers", async () => {
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.text()).toContain('7')
  })

  const COACH = { id: 9, team_id: 1, name: 'המאמן', name_en: null, jersey_number: null, is_coach: true, images: [] }

  it('renders a מאמנים group before the players', async () => {
    mockFetch({ 'GET /api/teams/1/players': () => jsonRes([COACH, ...PLAYERS]) })
    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['מאמנים', 'שחקנים'])
    expect(wrapper.find('ul').text()).toContain('המאמן')
  })

  it('no group headings when the team has no coaches', async () => {
    mockFetch({ 'GET /api/teams/1/players': () => jsonRes(PLAYERS) })
    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll('h2')).toHaveLength(0)
  })

  it('passes the team images to each player card', async () => {
    const images = [{ id: 1, url: '/t.jpg', player_ids: [1] }]
    mockFetch({
      'GET /api/teams/1/players': () => jsonRes(PLAYERS),
      'GET /api/teams/1/images': () => jsonRes(images),
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const { default: PlayerCard } = await import('../components/PlayerCard.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findComponent(PlayerCard).props('teamImages')).toEqual(images)
  })

  it('roster page no longer renders lineups', async () => {
    mockFetch({ 'GET /api/teams/1/players': () => jsonRes(PLAYERS) })

    const { default: RosterView } = await import('./RosterView.vue')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()

    expect(global.fetch.mock.calls.some(([u]) => u.includes('lineups'))).toBe(false)
    expect(wrapper.text()).not.toContain('חמישיות')
    expect(wrapper.find('#lineups').exists()).toBe(false)
  })

  it('ignores a late response for a team that is no longer selected', async () => {
    let resolveFirst
    const first = new Promise((r) => (resolveFirst = r))
    const other = [{ id: 30, team_id: 2, name: 'עמית', name_en: null, jersey_number: 3, images: [] }]
    global.fetch = vi.fn((url) => {
      if (url === '/api/teams/1/players') return first
      if (url === '/api/teams/2/players') return Promise.resolve(jsonRes(other))
      return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    })

    const { default: RosterView } = await import('./RosterView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(RosterView, { global: { plugins: [router] } })
    await flushPromises()
    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()
    resolveFirst(jsonRes(PLAYERS))
    await flushPromises()

    expect(wrapper.text()).toContain('עמית')
    expect(wrapper.text()).not.toContain('יוסי')
  })

  describe('inline editing (#471)', () => {
    const asTeamAdmin = async () => {
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
    }
    const button = (w, text) => w.findAll('button').find((b) => b.text().includes(text))

    it('team admin adds a coach inline and it lands in the מאמנים group', async () => {
      await asTeamAdmin()
      const created = { ...COACH, name: 'מאמן חדש' }
      mockFetch({
        'GET /api/teams/1/players': () => jsonRes(structuredClone(PLAYERS)),
        'GET /api/teams/1/images': () => jsonRes([]),
        'POST /api/teams/1/players': () => jsonRes(created, 201),
      })
      const { default: RosterView } = await import('./RosterView.vue')
      const w = mount(RosterView, { global: { plugins: [router] } })
      await flushPromises()

      await button(w, 'הוספת שחקן').trigger('click')
      await w.get('#player-name').setValue('מאמן חדש')
      await w.get('#player-is-coach').setValue(true)
      expect(w.find('#player-jersey-number').exists()).toBe(false)
      await w.get('#add-player-form').trigger('submit')
      await flushPromises()

      const [, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')
      expect(JSON.parse(options.body)).toMatchObject({ is_coach: true, jersey_number: null })
      expect(w.findAll('h2').map((h) => h.text())).toEqual(['מאמנים', 'שחקנים'])
      expect(w.find('#add-player-form').exists()).toBe(false)
    })

    it('team admin edits a player inline and focus returns to the edit button', async () => {
      await asTeamAdmin()
      mockFetch({
        'GET /api/teams/1/players': () => jsonRes(structuredClone(PLAYERS)),
        'GET /api/teams/1/images': () => jsonRes([]),
        'PATCH /api/teams/1/players/1': () => jsonRes({ ...PLAYERS[0], jersey_number: 23 }),
      })
      const { default: RosterView } = await import('./RosterView.vue')
      const w = mount(RosterView, { global: { plugins: [router] }, attachTo: document.body })
      await flushPromises()

      await w.get('#edit-player-1').trigger('click')
      await w.get('#player-jersey-number').setValue('23')
      await w.get('#player-editor-1 form').trigger('submit')
      await flushPromises()

      const [url, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      expect(url).toBe('/api/teams/1/players/1')
      expect(JSON.parse(options.body)).not.toHaveProperty('user_id')
      expect(w.text()).toContain('23')
      expect(w.find('#player-editor-1').exists()).toBe(false)
      expect(document.activeElement.id).toBe('edit-player-1')
      w.unmount()
    })

    it('fans and "view as player" see no add or edit controls', async () => {
      mockFetch({ 'GET /api/teams/1/players': () => jsonRes(structuredClone(PLAYERS)), 'GET /api/teams/1/images': () => jsonRes([]) })
      const { default: RosterView } = await import('./RosterView.vue')
      let w = mount(RosterView, { global: { plugins: [router] } })
      await flushPromises()
      expect(w.find('#edit-player-1').exists()).toBe(false)
      expect(w.text()).not.toContain('הוספת שחקן')

      await asTeamAdmin()
      const { viewAsMember } = await import('../composables/useAuth')
      viewAsMember.value = true
      w = mount(RosterView, { global: { plugins: [router] } })
      await flushPromises()
      expect(w.find('#edit-player-1').exists()).toBe(false)
      expect(w.text()).not.toContain('הוספת שחקן')
      viewAsMember.value = false
    })
  })
})
