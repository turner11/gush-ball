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
  scorers: [],
  videos: [],
  images: [],
  opponent: { id: 6, name: 'הפועל עבר', logo_url: null, source_url: null, address: 'רחוב הספורט 1, חיפה' },
}

function mockFetch(game) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams/1') return Promise.resolve({ ok: true, status: 200, json: async () => TEAM })
    if (url === '/api/teams/1/games/5') return Promise.resolve(game)
    if (url === '/api/teams/1/players') return Promise.resolve(ok([]))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountAt(teamsLoaded, teamId = '1') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' } },
      { path: '/players/:id', name: 'player', component: { template: '<div/>' } },
      { path: '/:slug/admin/players', name: 'admin-players', component: { template: '<div/>' } },
      { path: '/:slug/stats', name: 'stats', component: { template: '<div/>' } },
    ],
  })
  router.push('/team_a/games/5')
  await router.isReady()
  const { useSelectedTeam } = await import('../composables/useSelectedTeam')
  const sel = useSelectedTeam()
  sel.selectedTeamId.value = teamId
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

  it('shows the not-found state with a schedule link when no team resolves', async () => {
    mockFetch(ok(GAME))
    const { wrapper } = await mountAt(true, null)
    expect(wrapper.find('[aria-busy]').exists()).toBe(false)
    expect(wrapper.text()).toContain('המשחק לא נמצא.')
    expect(wrapper.find('a').attributes('href')).toBe('/team_a/schedule')
  })

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

  describe('scorers', () => {
    const SCORERS = [
      { player_id: 11, name: 'אלף', jersey_number: 7, points: 22 },
      { player_id: 12, name: 'בית', jersey_number: null, points: 10 },
    ]
    const withScorers = { ...GAME, scorers: SCORERS }

    it('lists scorers, highest first, with links to player pages', async () => {
      mockFetch(ok(withScorers))
      const { wrapper } = await mountAt(true)
      const rows = wrapper.findAll('ol li')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('אלף')
      expect(rows[0].text()).toContain('22')
      expect(rows[0].find('a').attributes('href')).toBe('/players/11')
    })

    it('hides the scorers card from visitors when there are none', async () => {
      mockFetch(ok(GAME))
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('קלעים')
    })

    it('team admin can open the scorers editor', async () => {
      mockFetch(ok(withScorers))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameScorersEditor } = await import('../components/GameScorersEditor.vue')
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(false)
      await wrapper.findAll('button').find((b) => b.text() === 'עריכת קלעים').trigger('click')
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(true)
    })

    it('non-admin sees no edit button', async () => {
      mockFetch(ok(withScorers))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 2, team_ids: [] }
      const { wrapper } = await mountAt(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'עריכת קלעים')).toBe(false)
    })
  })

  describe('media', () => {
    const withMedia = {
      ...GAME,
      videos: [{ url: 'https://www.youtube.com/watch?v=abc123', title: 'תקציר', title_en: null }],
      images: [{ url: 'https://cdn.example.com/a.jpg', title: 'חגיגה', title_en: null }],
    }

    it('renders a YouTube iframe and an image when the game has media', async () => {
      mockFetch(ok(withMedia))
      const { wrapper } = await mountAt(true)
      expect(wrapper.find('iframe').attributes('src')).toContain('abc123')
      expect(wrapper.find('img[src="https://cdn.example.com/a.jpg"]').attributes('alt')).toBe('חגיגה')
    })

    it('hides the media card from visitors when both lists are empty', async () => {
      mockFetch(ok(GAME))
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('מדיה')
    })

    it('team admin can open the media editor', async () => {
      mockFetch(ok(withMedia))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameMediaEditor } = await import('../components/GameMediaEditor.vue')
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(false)
      await wrapper.findAll('button').find((b) => b.text() === 'עריכת מדיה').trigger('click')
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(true)
    })

    it('non-admin sees no edit button', async () => {
      mockFetch(ok(withMedia))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 2, team_ids: [] }
      const { wrapper } = await mountAt(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'עריכת מדיה')).toBe(false)
    })
  })

  it('preview hides the scorers and media edit buttons from a team admin (#468)', async () => {
    mockFetch(ok({ ...GAME, scorers: [{ player_id: 2, name: 'x', points: 2 }], videos: [{ url: 'https://youtu.be/a', title: 't', title_en: null }] }))
    const { useAuth, viewAsMember } = await import('../composables/useAuth')
    useAuth().user.value = { id: 1, team_ids: [1] }
    viewAsMember.value = true
    const { wrapper } = await mountAt(true)
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).not.toContain('עריכת קלעים')
    expect(labels).not.toContain('עריכת מדיה')
  })
})
