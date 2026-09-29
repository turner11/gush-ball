import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א' }]
const TEAM = {
  id: 1,
  name: 'קבוצה א',
  name_en: null,
  slug: 'team-a',
  primary_color: null,
  secondary_color: null,
  logo_url: null,
  home_court_address: 'אולם הספורט, תל אביב',
  facebook_url: null,
  instagram_url: null,
  youtube_url: null,
  tiktok_url: null,
  twitter_url: null,
}
const LINKS = [{ id: 1, team_id: 1, label: 'אתר הליגה', label_en: null, url: 'https://example.com' }]
const VIDEOS = []
const IMAGES = []
const POSTS = [{ id: 1, team_id: 1, title: 'עדכון עונה', title_en: null, body: 'תוכן העדכון', body_en: null }]

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

describe('HomeView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/roster', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the selected team's content (links, posts)", async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'GET /api/teams/1/videos': () => jsonRes(VIDEOS),
      'GET /api/teams/1/images': () => jsonRes(IMAGES),
      'GET /api/teams/1/posts': () => jsonRes(POSTS),
      'GET /api/teams/1/players': () => jsonRes([]),
      'GET /api/teams/1/games': () => jsonRes([]),
    })

    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אתר הליגה')
    expect(wrapper.text()).toContain('עדכון עונה')
  })

  it('does not render its own team header', async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/teams/1/links': () => jsonRes([]),
      'GET /api/teams/1/videos': () => jsonRes([]),
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/posts': () => jsonRes([]),
      'GET /api/teams/1/players': () => jsonRes([]),
      'GET /api/teams/1/games': () => jsonRes([]),
    })

    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    // The layout hero owns the team identity (#106).
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('a[href^="https://www.google.com/maps"]').exists()).toBe(false)
  })

  it('shows an empty state when no team is selected (none in the DB)', async () => {
    localStorage.clear()
    mockFetch({})

    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין קבוצות במערכת עדיין')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1', expect.anything())
  })
  async function mountWithTeam(team, { links = [], players = [], games = [] } = {}) {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(team),
      'GET /api/teams/1/links': () => jsonRes(links),
      'GET /api/teams/1/videos': () => jsonRes([]),
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/posts': () => jsonRes([]),
      'GET /api/teams/1/players': () => jsonRes(players),
      'GET /api/teams/1/games': () => jsonRes(games),
    })
    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('embeds the Facebook page plugin when facebook_url is set', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' })

    const src = wrapper.find('iframe').attributes('src')
    expect(src.startsWith('https://www.facebook.com/plugins/page.php?')).toBe(true)
    expect(src).toContain('href=https%3A%2F%2Fwww.facebook.com%2Fgushclub')
  })

  it('renders no social embed when all social urls are null', async () => {
    const wrapper = await mountWithTeam(TEAM)

    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('a.twitter-timeline').exists()).toBe(false)
  })

  it('embeds the Instagram profile for instagram_url', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, instagram_url: 'https://www.instagram.com/gushclub/?hl=he' })

    expect(wrapper.find('iframe').attributes('src')).toBe('https://www.instagram.com/gushclub/embed')
  })

  it('renders a twitter timeline anchor and loads widgets.js once', async () => {
    const team = { ...TEAM, twitter_url: 'https://x.com/gushclub' }
    const wrapper = await mountWithTeam(team)
    await mountWithTeam(team)

    expect(wrapper.find('a.twitter-timeline').attributes('href')).toBe('https://x.com/gushclub')
    expect(document.querySelectorAll('script#twitter-wjs').length).toBe(1)
  })

  it('re-renders the twitter timeline anchor when switching teams', async () => {
    const teamB = { ...TEAM, id: 2, twitter_url: 'https://x.com/teamb' }
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, twitter_url: 'https://x.com/teama' }),
      'GET /api/teams/2': () => jsonRes(teamB),
      ...Object.fromEntries(
        [1, 2].flatMap((id) => ['links', 'videos', 'images', 'posts', 'players', 'games'].map((r) => [`GET /api/teams/${id}/${r}`, () => jsonRes([])])),
      ),
    })
    const { default: HomeView } = await import('./HomeView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(HomeView, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()

    // Simulate widgets.js swapping the anchor for its own iframe.
    wrapper.find('a.twitter-timeline').element.replaceWith(document.createElement('iframe'))

    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()

    expect(wrapper.find('a.twitter-timeline').attributes('href')).toBe('https://x.com/teamb')
    wrapper.unmount()
  })

  it('shows only platforms that have a url', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' })

    expect(wrapper.findAll('iframe').length).toBe(1)
    expect(wrapper.find('a.twitter-timeline').exists()).toBe(false)
  })

  it('shows the next and the last match', async () => {
    const opp = (name) => ({ name, source_url: null })
    const wrapper = await mountWithTeam(TEAM, {
      games: [
        { id: 1, opponent: opp('יריבה א'), scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null },
        { id: 2, opponent: opp('יריבה ב'), scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 80, opponent_score: 70 },
      ],
    })

    expect(wrapper.text()).toContain('יריבה א')
    expect(wrapper.text()).toContain('יריבה ב')
    expect(wrapper.text()).toContain('80 : 70')
  })

  it('renders a carousel card per player', async () => {
    const wrapper = await mountWithTeam(TEAM, {
      players: [
        { id: 1, name: 'דני', jersey_number: 4, images: [] },
        { id: 2, name: 'רון', jersey_number: 7, images: [] },
      ],
    })

    const cards = wrapper.findAll('ul.snap-x > li')
    expect(cards.length).toBe(2)
    expect(cards[0].text()).toContain('דני')
    expect(cards[1].text()).toContain('רון')
  })

  it('links to the stats page (roster)', async () => {
    const wrapper = await mountWithTeam(TEAM)

    const link = wrapper.findAll('a').find((a) => a.text() === 'סטטיסטיקה')
    expect(link.attributes('href')).toBe('/roster')
  })

  it('hides sections with no content', async () => {
    const wrapper = await mountWithTeam(TEAM)

    for (const title of ['קישורים', 'סרטונים', 'תמונות', 'עדכונים', 'שחקנים']) {
      expect(wrapper.text()).not.toContain(title)
    }
    expect(wrapper.find('.empty-state').exists()).toBe(false)
  })

  it('uses the full width when the team has no social links', async () => {
    const wrapper = await mountWithTeam(TEAM)

    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('md:col-span-2')
    expect(wrapper.html()).not.toContain('md:grid-cols-3')
  })

  it('puts social embeds in the aside, apart from the links section', async () => {
    const wrapper = await mountWithTeam(
      { ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' },
      { links: LINKS },
    )

    const aside = wrapper.find('aside')
    expect(aside.find('iframe').exists()).toBe(true)
    expect(aside.text()).not.toContain('קישורים')
  })
})
