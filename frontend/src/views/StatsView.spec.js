import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PLAYERS = [{ id: 1, team_id: 1, name: 'יוסי כהן', jersey_number: 7, images: [] }]
const game = (id, day, has_stats) => ({
  id,
  team_id: 1,
  scheduled_at: `2026-03-${day}T18:00:00`,
  has_stats,
  opponent: { id: 10 + id, name: `יריבה ${id}` },
})
const GAMES = [game(1, '01', false), game(2, '04', true), game(3, '11', true)]
const LINEUPS = 'GET /api/teams/1/lineups?size=5&sort=top'

function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body }
}

function mockFetch(overrides = {}) {
  const handlers = {
    'GET /api/teams/1/players': () => jsonRes(PLAYERS),
    'GET /api/teams/1/games': () => jsonRes(GAMES),
    [LINEUPS]: () => jsonRes([]),
    [`${LINEUPS}&game_id=2`]: () => jsonRes([]),
    [`${LINEUPS}&game_id=3`]: () => jsonRes([]),
    ...overrides,
  }
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    return handler ? Promise.resolve(handler()) : Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

const urls = () => global.fetch.mock.calls.map(([u]) => u)
const NOTE = 'המשחק המבוקש לא נמצא'

describe('StatsView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/stats', name: 'stats', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => vi.restoreAllMocks())

  async function mountView() {
    const { default: StatsView } = await import('./StatsView.vue')
    const wrapper = mount(StatsView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  async function mountAt(path = '/stats') {
    mockFetch()
    await router.push(path)
    return mountView()
  }

  it('picker lists "all games" plus only has_stats games, newest first', async () => {
    const wrapper = await mountAt()
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.element.value)).toEqual(['', '3', '2'])
    expect(options[1].text()).toContain('יריבה 3')
  })

  it("picking a game pushes ?game= and loads that game's lineups", async () => {
    const wrapper = await mountAt()
    await wrapper.find('select').setValue('2')
    await flushPromises()
    expect(router.currentRoute.value.query.game).toBe('2')
    expect(urls()).toContain('/api/teams/1/lineups?size=5&sort=top&game_id=2')

    await wrapper.find('select').setValue('')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('deep link /stats?game=2 preselects it', async () => {
    const wrapper = await mountAt('/stats?game=2')
    expect(wrapper.find('select').element.value).toBe('2')
    expect(urls()).toContain('/api/teams/1/lineups?size=5&sort=top&game_id=2')
    expect(wrapper.text()).not.toContain(NOTE)
  })

  it.each(['99', '1'])('unknown ?game=%s falls back to all games with a note', async (id) => {
    const wrapper = await mountAt(`/stats?game=${id}`)
    expect(wrapper.find('select').element.value).toBe('')
    expect(urls()).toContain('/api/teams/1/lineups?size=5&sort=top')
    expect(urls().some((u) => u.includes('game_id'))).toBe(false)
    expect(wrapper.text()).toContain(NOTE)
    expect(router.currentRoute.value.query.game).toBe(id)
  })

  it('team without stats shows the empty state', async () => {
    mockFetch({ 'GET /api/teams/1/games': () => jsonRes([game(1, '01', false)]) })
    await router.push('/stats')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('עדיין אין נתונים לקבוצה')
    expect(wrapper.find('select').exists()).toBe(false)
    expect(urls().some((u) => u.includes('lineups'))).toBe(false)
  })

  it('games load error shows retry that reloads', async () => {
    global.fetch = vi.fn((url) =>
      url.endsWith('/games') ? Promise.reject(new Error('boom')) : Promise.resolve(jsonRes(url.includes('players') ? PLAYERS : [])),
    )
    await router.push('/stats')
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('שגיאה בטעינת הסטטיסטיקה')

    mockFetch()
    await wrapper.findAll('button').find((b) => b.text() === 'נסה שוב').trigger('click')
    await flushPromises()
    expect(wrapper.find('select').exists()).toBe(true)
  })
})
