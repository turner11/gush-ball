import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OURS = [{ id: 1, name: 'קבוצה שלנו', name_en: 'Team A', logo_url: 'https://cdn.example.com/a.png' }]
const sp = (name, team_id = null) => ({ name, logo_url: null, ibasketball_team_url: `https://x/team/${name}/`, team_id })

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const err = (status) => ({ ok: false, status, statusText: 'err', json: async () => ({}) })

function mockApi(leagueRes) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams') return Promise.resolve(ok(OURS))
    if (url === '/api/leagues/10/teams') return Promise.resolve(typeof leagueRes === 'function' ? leagueRes() : leagueRes)
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

async function mountView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/teams', name: 'teams', component: { template: '<div/>' } },
      { path: '/teams/:leagueId', name: 'league-teams', component: { template: '<div/>' } },
    ],
  })
  await router.push('/teams/10')
  const { default: View } = await import('./LeagueTeamsView.vue')
  const wrapper = mount(View, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('LeagueTeamsView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('links on-site teams to their page with our name and logo; lists the rest unlinked', async () => {
    mockApi(ok({ league: { ibasketball_id: 10, name: 'ליגת א', url: 'u' }, teams: [sp('SP שלנו', 1), sp('קבוצה זרה')] }))
    const wrapper = await mountView()

    expect(wrapper.find('h1').text()).toBe('ליגת א')
    const link = wrapper.findAll('a').find((a) => a.attributes('href') === '/team_a')
    expect(link.text()).toBe('קבוצה שלנו')
    expect(link.find('img').attributes('src')).toBe('https://cdn.example.com/a.png')
    expect(wrapper.text()).not.toContain('SP שלנו')
    expect(wrapper.text()).toContain('קבוצה זרה')
    expect(wrapper.findAll('a').filter((a) => a.text().includes('קבוצה זרה'))).toHaveLength(0)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('404 shows league-not-found with a way back; other errors offer retry', async () => {
    mockApi(err(404))
    let wrapper = await mountView()
    expect(wrapper.text()).toContain('הליגה לא נמצאה')
    expect(wrapper.find('a[href="/teams"]').exists()).toBe(true)

    vi.resetModules()
    let calls = 0
    mockApi(() => (calls++ ? ok({ league: { ibasketball_id: 10, name: 'ליגת א', url: 'u' }, teams: [sp('x')] }) : err(502)))
    wrapper = await mountView()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('ליגת א')
  })

  it('empty league shows an empty state', async () => {
    mockApi(ok({ league: { ibasketball_id: 10, name: 'ליגת א', url: 'u' }, teams: [] }))
    expect((await mountView()).text()).toContain('אין קבוצות בליגה הזו עדיין.')
  })
})
