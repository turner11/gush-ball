import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PLAYERS = [
  { id: 2, name: 'בית', jersey_number: 9 },
  { id: 1, name: 'אלף', jersey_number: 7 },
]
const GAME = {
  id: 5,
  team_score: 30,
  scorers: [
    { player_id: 1, name: 'אלף', jersey_number: 7, points: 12 },
    { player_id: 3, name: 'גימל שנמחק', jersey_number: 4, points: 8 },
  ],
}
const res = (body, status = 200) => ({ ok: true, status, json: async () => body })

function mockFetch({ players = PLAYERS, game = GAME, put } = {}) {
  global.fetch = vi.fn((url, options = {}) => {
    if (options.method === 'PUT') return Promise.resolve(put ? put() : res([]))
    if (url === '/api/teams/1/players') return Promise.resolve(res(players))
    if (url === '/api/teams/1/games/5') return Promise.resolve(res(game))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

async function mountEditor() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:slug/admin/players', name: 'admin-players', component: { template: '<div/>' } }],
  })
  router.push('/team_a/admin/players')
  await router.isReady()
  const { default: Editor } = await import('./GameScorersEditor.vue')
  const wrapper = mount(Editor, { props: { teamId: 1, gameId: 5 }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('GameScorersEditor', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it("prefills points from the game's scorers and shows the total against the team score", async () => {
    mockFetch()
    const wrapper = await mountEditor()
    expect(wrapper.find('#scorer-1').element.value).toBe('12')
    expect(wrapper.find('#scorer-2').element.value).toBe('')
    expect(wrapper.find('#scorer-3').element.value).toBe('8') // soft-deleted player still gets a row
    expect(wrapper.text()).toContain('סה״כ 20')
    expect(wrapper.text()).toContain('30')
  })

  it('saves only filled rows, including 0, and emits saved', async () => {
    const saved = [{ player_id: 2, name: 'בית', jersey_number: 9, points: 0 }]
    mockFetch({ put: () => res(saved) })
    const wrapper = await mountEditor()
    await wrapper.find('#scorer-1').setValue('')
    await wrapper.find('#scorer-3').setValue('')
    await wrapper.find('#scorer-2').setValue('0')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const put = global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')
    expect(put[0]).toBe('/api/teams/1/games/5/scorers')
    expect(JSON.parse(put[1].body)).toEqual([{ player_id: 2, points: 0 }])
    expect(wrapper.emitted('saved')[0][0]).toEqual(saved)
    expect(wrapper.find('[aria-live=polite]').text()).toBe('הקלעים נשמרו')
  })

  it('shows a Hebrew message, not [object Object], on a validation error', async () => {
    mockFetch({
      put: () => ({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'less than or equal to 200' }] }) }),
    })
    const wrapper = await mountEditor()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('נקודות לא תקינות (0 עד 200)')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('empty roster links to player management', async () => {
    mockFetch({ players: [], game: { ...GAME, scorers: [] } })
    const wrapper = await mountEditor()
    expect(wrapper.text()).toContain('אין שחקנים בסגל.')
    expect(wrapper.find('a').attributes('href')).toBe('/team_a/admin/players')
  })
})
