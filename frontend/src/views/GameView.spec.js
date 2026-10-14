import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAM = { id: 1, name: 'קבוצה א', name_en: 'Team A', logo_url: null, home_court_address: null, ibasketball_team_url: null }
const GAME = {
  id: 5,
  team_id: 1,
  is_home: false,
  scheduled_at: '2020-05-01T18:00:00',
  status: 'final',
  has_stats: false,
  team_score: 80,
  opponent_score: 70,
  description: 'משחק גמר מרגש',
  opponent: { id: 6, name: 'הפועל עבר', logo_url: null, source_url: null, address: 'רחוב הספורט 1, חיפה' },
}

function mockFetch(game) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams/1') return Promise.resolve({ ok: true, status: 200, json: async () => TEAM })
    if (url === '/api/teams/1/games/5') return Promise.resolve(game)
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountAt(teamsLoaded) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' } },
      { path: '/:slug/stats', name: 'stats', component: { template: '<div/>' } },
    ],
  })
  router.push('/team_a/games/5')
  await router.isReady()
  const { useSelectedTeam } = await import('../composables/useSelectedTeam')
  const sel = useSelectedTeam()
  sel.selectedTeamId.value = '1'
  sel.teamsLoaded.value = teamsLoaded
  const { default: GameView } = await import('./GameView.vue')
  const wrapper = mount(GameView, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, sel, router }
}

describe('GameView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders a played game: scoreboard, date, venue and description', async () => {
    mockFetch(ok(GAME))
    const { wrapper } = await mountAt(true)
    const text = wrapper.text()
    expect(text).toContain('הפועל עבר')
    expect(text).toContain('70 : 80')
    expect(text).toContain('משחק גמר מרגש')
    expect(wrapper.find('a[href*="google.com/maps"]').exists()).toBe(true)
  })

  it('shows not-found for a 404 game', async () => {
    mockFetch({ ok: false, status: 404, json: async () => ({}) })
    const { wrapper } = await mountAt(true)
    expect(wrapper.text()).toContain('המשחק לא נמצא.')
    expect(wrapper.find('a[href="/team_a/schedule"]').exists()).toBe(true)
  })

  it('waits for the team list before fetching', async () => {
    mockFetch(ok(GAME))
    const { wrapper, sel } = await mountAt(false)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(wrapper.find('[aria-busy=true]').exists()).toBe(true)
    sel.teamsLoaded.value = true
    await flushPromises()
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/teams/1/games/5')
  })
})
