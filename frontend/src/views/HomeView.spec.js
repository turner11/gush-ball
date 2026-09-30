import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDateTime } from '../lib/format'

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
        { path: '/media', component: { template: '<div/>' } },
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
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    // First-time visitor: no welcome until /teams has actually loaded.
    expect(wrapper.text()).not.toContain('אין קבוצות במערכת עדיין')
    useSelectedTeam().ensureDefault([])
    await flushPromises()

    expect(wrapper.text()).toContain('אין קבוצות במערכת עדיין')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1', expect.anything())
  })
  async function mountWithTeam(team, { links = [], players = [], games = [], videos = [], posts = [] } = {}) {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(team),
      'GET /api/teams/1/links': () => jsonRes(links),
      'GET /api/teams/1/videos': () => jsonRes(videos),
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/posts': () => jsonRes(posts),
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
    const opp = (name, logo_url = null) => ({ name, source_url: null, logo_url })
    const wrapper = await mountWithTeam(TEAM, {
      games: [
        { id: 1, opponent: opp('יריבה א', 'https://l/a.png'), scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null },
        { id: 2, opponent: opp('יריבה ב', 'https://l/b.png'), scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 80, opponent_score: 70 },
      ],
    })

    expect(wrapper.text()).toContain('יריבה א')
    expect(wrapper.text()).toContain('יריבה ב')
    // away game: home side (the opponent) first, so its score reads first
    expect(wrapper.text()).toContain('70 : 80')
    const cards = wrapper.findAll('div.card')
    expect(cards.some((c) => c.find('img[src="https://l/a.png"]').exists())).toBe(true)
    expect(cards.some((c) => c.find('img[src="https://l/b.png"]').exists())).toBe(true)
  })

  it('puts the home side first: us at home, the opponent away', async () => {
    const opp = (name) => ({ name, source_url: null, logo_url: null })
    const wrapper = await mountWithTeam(TEAM, {
      games: [
        { id: 1, opponent: opp('מארחת'), scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 80, opponent_score: 70 },
        { id: 2, opponent: opp('אורחת'), scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null },
      ],
    })

    const sides = (card) => card.findAll('p.font-bold').map((p) => p.text())
    const [last, next] = wrapper.findAll('div.card')
    expect(sides(last)).toEqual(['מארחת', 'קבוצה א'])
    expect(sides(next)).toEqual(['קבוצה א', 'אורחת'])
  })

  it('a lone match card spans the full row and does not repeat its date', async () => {
    const scheduled_at = '2999-01-01T18:00:00'
    const wrapper = await mountWithTeam(TEAM, {
      games: [{ id: 1, opponent: { name: 'יריבה', source_url: null, logo_url: null }, scheduled_at, is_home: true, team_score: null, opponent_score: null }],
    })

    const card = wrapper.find('div.card')
    expect(card.element.parentElement.className).not.toContain('sm:grid-cols-2')
    expect(card.text()).not.toContain(formatDateTime(scheduled_at))
  })

  it('shows the full date under a played game', async () => {
    const scheduled_at = '2000-01-01T18:00:00'
    const wrapper = await mountWithTeam(TEAM, {
      games: [{ id: 1, opponent: { name: 'יריבה', source_url: null, logo_url: null }, scheduled_at, is_home: true, team_score: 80, opponent_score: 70 }],
    })

    expect(wrapper.find('div.card').text()).toContain(formatDateTime(scheduled_at))
  })

  describe('game location links', () => {
    const opp = { name: 'יריבה', source_url: null, logo_url: null }
    const game = (id, scheduled_at, is_home) => ({ id, opponent: opp, scheduled_at, is_home, team_score: null, opponent_score: null })
    const google = `a[href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(TEAM.home_court_address)}"]`
    const waze = `a[href^="https://waze.com/ul?q=${encodeURIComponent(TEAM.home_court_address)}"]`

    it('shows maps and waze links on home game cards', async () => {
      const wrapper = await mountWithTeam(TEAM, {
        games: [game(1, '2999-01-01T18:00:00', true), game(2, '2000-01-01T18:00:00', true)],
      })
      const cards = wrapper.findAll('div.card')
      expect(cards).toHaveLength(2)
      for (const c of cards) {
        expect(c.find(google).exists()).toBe(true)
        expect(c.find(waze).exists()).toBe(true)
      }
    })

    it('hides location links on away games and when the team has no address', async () => {
      const away = await mountWithTeam(TEAM, { games: [game(1, '2999-01-01T18:00:00', false)] })
      expect(away.find(google).exists()).toBe(false)
      expect(away.find(waze).exists()).toBe(false)

      const noAddr = await mountWithTeam({ ...TEAM, home_court_address: null }, { games: [game(1, '2999-01-01T18:00:00', true)] })
      expect(noAddr.find('a[href*="google.com/maps"]').exists()).toBe(false)
      expect(noAddr.find('a[href*="waze.com"]').exists()).toBe(false)
    })
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

  it('omits the jersey badge for a player without a number', async () => {
    const wrapper = await mountWithTeam(TEAM, { players: [{ id: 1, name: 'דני', jersey_number: null, images: [] }] })

    expect(wrapper.find('ul.snap-x > li').text()).not.toContain('#')
  })

  it('has no stats link (moved to the top nav)', async () => {
    const wrapper = await mountWithTeam(TEAM)

    expect(wrapper.findAll('a').some((a) => a.text() === 'סטטיסטיקה')).toBe(false)
  })

  it('shows the last game before the next game in one row', async () => {
    const opp = (name) => ({ name, source_url: null, logo_url: null })
    const wrapper = await mountWithTeam(TEAM, {
      games: [
        { id: 1, opponent: opp('יריבה א'), scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null },
        { id: 2, opponent: opp('יריבה ב'), scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 80, opponent_score: 70 },
      ],
    })

    const cards = wrapper.findAll('div.card')
    expect(cards[0].text()).toContain('יריבה ב')
    expect(cards[0].element.parentElement.className).toContain('sm:grid-cols-2')
  })

  it('shows only the newest post', async () => {
    const post = (id) => ({ id, team_id: 1, title: `פוסט ${id}`, body: 'x' })
    const wrapper = await mountWithTeam(TEAM, { posts: [post(2), post(1)] })

    expect(wrapper.text()).toContain('פוסט 2')
    expect(wrapper.text()).not.toContain('פוסט 1')
  })

  it('orders sections: games, post, players, videos', async () => {
    const opp = { name: 'יריבה', source_url: null, logo_url: null }
    const wrapper = await mountWithTeam(TEAM, {
      games: [
        { id: 1, opponent: opp, scheduled_at: '2999-01-01T18:00:00', is_home: false, team_score: null, opponent_score: null },
        { id: 2, opponent: opp, scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 1, opponent_score: 2 },
      ],
      posts: [{ id: 1, title: 'פוסט', body: 'x' }],
      players: [{ id: 1, name: 'דני', jersey_number: 4, images: [] }],
      videos: [{ id: 1, title: 'וידאו', url: 'https://vimeo.com/1' }],
    })

    const titles = wrapper.findAll('h2').map((h) => h.text())
    expect(titles).toEqual(['המשחק האחרון', 'המשחק הבא', 'עדכונים', 'שחקנים', 'סרטונים'])
  })

  it('shows only the 2 newest videos', async () => {
    const wrapper = await mountWithTeam(TEAM, {
      videos: [
        { id: 1, title: 'ישן', url: 'https://youtu.be/v1' },
        { id: 2, title: 'אמצע', url: 'https://youtu.be/v2' },
        { id: 3, title: 'חדש', url: 'https://youtu.be/v3' },
      ],
    })

    const titles = wrapper.findAll('article h3').map((h) => h.text())
    expect(titles).toEqual(['חדש', 'אמצע'])
    expect(wrapper.findAll('article').length).toBe(2)
    expect(wrapper.text()).not.toContain('ישן')
  })

  it('links to all videos on the media page', async () => {
    const wrapper = await mountWithTeam(TEAM, { videos: [{ id: 1, title: 'א', url: 'https://vimeo.com/1' }] })

    expect(wrapper.find('a[href="/media"]').text()).toBe('כל הסרטונים')
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

  it('gives the main column more width than the social aside', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' })

    expect(wrapper.html()).toContain('md:grid-cols-[3fr_2fr]')
    expect(wrapper.html()).toContain('gap-12')
    // grid tracks never shrink below their content without min-w-0; the carousel would overflow the page
    const grid = wrapper.find('.gap-12').element
    expect([...grid.children].every((c) => c.classList.contains('min-w-0'))).toBe(true)
    expect(wrapper.html()).not.toContain('md:grid-cols-3')
    expect(wrapper.html()).not.toContain('md:col-span-2')
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
