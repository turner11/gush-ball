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
  wikipedia_url: null,
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
        { path: '/:slug/roster', component: { template: '<div/>' } },
        { path: '/:slug/games/:id', component: { template: '<div/>' } },
        { path: '/:slug/media', component: { template: '<div/>' } },
        { path: '/admin/teams/:id', name: 'admin-team-edit', component: { template: '<div/>' } },
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
    useSelectedTeam().markTeamsLoaded([])
    await flushPromises()

    expect(wrapper.text()).toContain('אין קבוצות במערכת עדיין')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1', expect.anything())
  })
  async function mountWithTeam(team, { links = [], players = [], games = [], videos = [], posts = [], images = [], extra = {} } = {}) {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(team),
      'GET /api/teams/1/links': () => jsonRes(links),
      'GET /api/teams/1/videos': () => jsonRes(videos),
      'GET /api/teams/1/images': () => jsonRes(images),
      'GET /api/teams/1/posts': () => jsonRes(posts),
      'GET /api/teams/1/players': () => jsonRes(players),
      'GET /api/teams/1/games': () => jsonRes(games),
      ...extra,
    })
    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it("section links point at the team's pages", async () => {
    const wrapper = await mountWithTeam(
      { ...TEAM, name_en: 'Elizur' },
      { players: [{ id: 1, name: 'דני', jersey_number: 4, images: [] }], posts: POSTS },
    )

    const hrefOf = (text) => wrapper.findAll('a').find((a) => a.text() === text).attributes('href')
    expect(hrefOf('לכל הסגל')).toBe('/elizur/roster')
    expect(hrefOf('כל העדכונים')).toBe('/elizur/media')
  })

  it('embeds the Facebook page plugin when facebook_url is set', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' })

    const src = wrapper.find('iframe').attributes('src')
    expect(src.startsWith('https://www.facebook.com/plugins/page.php?')).toBe(true)
    expect(src).toContain('href=https%3A%2F%2Fwww.facebook.com%2Fgushclub')
    // sized to its frame (jsdom reports 0px), clamped to the plugin's 180–500 range
    expect(src).toContain('width=180&')
  })

  it('renders no social embed when all social urls are null', async () => {
    const wrapper = await mountWithTeam(TEAM)

    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('embeds the Instagram profile for instagram_url', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, instagram_url: 'https://www.instagram.com/gushclub/?hl=he' })

    expect(wrapper.find('iframe').attributes('src')).toBe('https://www.instagram.com/gushclub/embed')
  })

  it('embeds the X timeline as an iframe and loads no X script', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, twitter_url: 'https://x.com/gushclub' })

    expect(wrapper.find('iframe').attributes('src')).toBe(
      'https://syndication.twitter.com/srv/timeline-profile/screen-name/gushclub',
    )
    expect(document.querySelector('script[src*="twitter.com"]')).toBeNull()
  })

  it('shows the Wikipedia button and preview for wikipedia_url', async () => {
    const url = 'https://he.wikipedia.org/wiki/X'
    const summary = 'https://he.wikipedia.org/api/rest_v1/page/summary/X'
    const body = { type: 'standard', title: 'כותרת ויקי', extract: 'תקציר' }
    const wrapper = await mountWithTeam({ ...TEAM, wikipedia_url: url }, { extra: { [`GET ${summary}`]: () => jsonRes(body) } })

    expect(wrapper.findAll('a.btn-secondary').find((a) => a.text() === 'ויקיפדיה').attributes('href')).toBe(url)
    expect(wrapper.text()).toContain('כותרת ויקי')
  })

  it('shows only platforms that have a url', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, facebook_url: 'https://www.facebook.com/gushclub' })

    expect(wrapper.findAll('iframe').length).toBe(1)
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

  it('links our team and the opponent to their ibasketball pages on match cards', async () => {
    const us = 'https://ibasketball.co.il/team/1/'
    const them = 'https://ibasketball.co.il/team/2/'
    const wrapper = await mountWithTeam(
      { ...TEAM, ibasketball_team_url: us },
      { games: [{ id: 1, opponent: { name: 'אורחת', source_url: them, logo_url: null }, scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null }] },
    )

    const links = wrapper.find('div.card').findAll('p.font-bold a')
    expect(links.map((a) => [a.text(), a.attributes('href'), a.attributes('target')])).toEqual([
      ['קבוצה א', us, '_blank'],
      ['אורחת', them, '_blank'],
    ])
  })

  it('renders plain names when the ibasketball URLs are unset', async () => {
    const wrapper = await mountWithTeam(
      { ...TEAM, ibasketball_team_url: null },
      { games: [{ id: 1, opponent: { name: 'אורחת', source_url: null, logo_url: null }, scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null }] },
    )

    const card = wrapper.find('div.card')
    expect(card.findAll('p.font-bold a')).toHaveLength(0)
    expect(card.findAll('p.font-bold').map((p) => p.text())).toEqual(['קבוצה א', 'אורחת'])
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

  it('links each game card to its game page', async () => {
    const wrapper = await mountWithTeam(TEAM, {
      games: [{ id: 7, opponent: { name: 'יריבה', source_url: null, logo_url: null }, scheduled_at: '2999-01-01T18:00:00', is_home: true, team_score: null, opponent_score: null }],
    })
    expect(wrapper.find('a[href$="/games/7"]').text()).toBe('פרטי המשחק')
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

    it('uses the opponent address on away games', async () => {
      const address = 'רחוב היריבה 2, חיפה'
      const awayGame = { ...game(1, '2999-01-01T18:00:00', false), opponent: { ...opp, address } }
      const wrapper = await mountWithTeam(TEAM, { games: [awayGame] })
      expect(wrapper.find(`a[href^="https://waze.com/ul?q=${encodeURIComponent(address)}"]`).exists()).toBe(true)
      expect(wrapper.find(waze).exists()).toBe(false)
    })

    it('hides location links on away games without an opponent address and when the team has no address', async () => {
      const away = await mountWithTeam(TEAM, { games: [game(1, '2999-01-01T18:00:00', false)] })
      expect(away.find(google).exists()).toBe(false)
      expect(away.find(waze).exists()).toBe(false)

      const noAddr = await mountWithTeam({ ...TEAM, home_court_address: null }, { games: [game(1, '2999-01-01T18:00:00', true)] })
      expect(noAddr.find('a[href*="google.com/maps"]').exists()).toBe(false)
      expect(noAddr.find('a[href*="waze.com"]').exists()).toBe(false)
    })
  })

  it('renders the home slideshow with the full images list', async () => {
    const images = [
      { id: 1, title: 'a', url: '/a.jpg', player_ids: [], hidden_from_home: false },
      { id: 2, title: 'b', url: '/b.jpg', player_ids: [], hidden_from_home: true },
    ]
    const wrapper = await mountWithTeam(TEAM, { images })
    const { default: HomeSlideshow } = await import('../components/HomeSlideshow.vue')
    expect(wrapper.findComponent(HomeSlideshow).props('images')).toEqual(images)
  })

  it('passes the team images to the player cards', async () => {
    const images = [{ id: 1, url: '/t.jpg', player_ids: [1] }]
    const wrapper = await mountWithTeam(TEAM, {
      players: [{ id: 1, name: 'דני', jersey_number: 4, images: [] }],
      images,
    })
    const { default: PlayerCard } = await import('../components/PlayerCard.vue')
    expect(wrapper.findComponent(PlayerCard).props('teamImages')).toEqual(images)
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

  it('shows the pinned post over a newer one', async () => {
    const post = (id, pinned) => ({ id, team_id: 1, title: `פוסט ${id}`, body: 'x', pinned })
    const wrapper = await mountWithTeam(TEAM, { posts: [post(1, true), post(2, false)] })

    expect(wrapper.text()).toContain('פוסט 1')
    expect(wrapper.text()).not.toContain('פוסט 2')
  })

  it('shows the about section when the team has about text', async () => {
    const wrapper = await mountWithTeam({ ...TEAM, about: 'קבוצה ותיקה' })

    expect(wrapper.text()).toContain('על הקבוצה')
    expect(wrapper.text()).toContain('קבוצה ותיקה')
  })

  it('orders sections: games, about, post, players, videos', async () => {
    const opp = { name: 'יריבה', source_url: null, logo_url: null }
    const wrapper = await mountWithTeam({ ...TEAM, about: 'x' }, {
      games: [
        { id: 1, opponent: opp, scheduled_at: '2999-01-01T18:00:00', is_home: false, team_score: null, opponent_score: null },
        { id: 2, opponent: opp, scheduled_at: '2000-01-01T18:00:00', is_home: false, team_score: 1, opponent_score: 2 },
      ],
      posts: [{ id: 1, title: 'פוסט', body: 'x' }],
      players: [{ id: 1, name: 'דני', jersey_number: 4, images: [] }],
      videos: [{ id: 1, title: 'וידאו', url: 'https://vimeo.com/1' }],
    })

    const titles = wrapper.findAll('h2').map((h) => h.text())
    expect(titles).toEqual(['המשחק האחרון', 'המשחק הבא', 'על הקבוצה', 'עדכונים', 'הסגל', 'סרטונים'])
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

    expect(wrapper.find('a[href="/1/media"]').text()).toBe('כל הסרטונים')
  })

  it('hides sections with no content', async () => {
    const wrapper = await mountWithTeam(TEAM)

    for (const title of ['קישורים', 'סרטונים', 'תמונות', 'עדכונים', 'הסגל', 'על הקבוצה']) {
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

    expect(wrapper.html()).toContain('lg:grid-cols-[1fr_20rem]')
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

  describe('edit entry points (#496)', () => {
    const asTeamAdmin = async () => {
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      return useAuth
    }

    it("team admin's about and links edit buttons link to the team manage page", async () => {
      await asTeamAdmin()
      const w = await mountWithTeam(TEAM, { links: LINKS })
      const hrefs = ['עריכה', 'עריכת קישורים'].map((t) => w.findAll('a').find((a) => a.text() === t).attributes('href'))
      expect(hrefs).toEqual(['/admin/teams/1', '/admin/teams/1'])
      expect(w.find('#home-about-editor').exists()).toBe(false)
      expect(w.findComponent({ name: 'TeamContentSection' }).exists()).toBe(false)
      expect(w.text()).not.toContain('צבעי הקבוצה')
    })

    it('team admin edits posts inline on the home page, and closing reloads them (#499)', async () => {
      await asTeamAdmin()
      const w = await mountWithTeam(TEAM, { posts: [] })
      const button = (t) => w.findAll('button').find((b) => b.text() === t)
      const postGets = () => global.fetch.mock.calls.filter(([u, o]) => u === '/api/teams/1/posts' && !o?.method).length
      expect(w.text()).toContain('אין עדכונים עדיין.')

      await button('עריכת עדכונים').trigger('click')
      await flushPromises()
      expect(w.findAllComponents({ name: 'TeamContentSection' }).some((c) => c.props('resource') === 'posts')).toBe(true)

      const before = postGets()
      await button('סיום עריכה').trigger('click')
      await flushPromises()
      expect(postGets()).toBeGreaterThan(before)
      expect(w.findComponent({ name: 'TeamContentSection' }).exists()).toBe(false)
    })

    it('visitors and preview see no edit controls on the team home', async () => {
      const useAuth = await asTeamAdmin()
      useAuth().user.value = null
      let w = await mountWithTeam(TEAM)
      expect(w.text()).not.toContain('עריכה')
      expect(w.text()).not.toContain('עריכת קישורים')
      expect(w.text()).not.toContain('עריכת עדכונים')
      const { previewMode } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      previewMode.value = 'member'
      w = await mountWithTeam(TEAM)
      expect(w.text()).not.toContain('עריכה')
      expect(w.text()).not.toContain('עריכת קישורים')
      expect(w.text()).not.toContain('על הקבוצה')
      expect(w.text()).not.toContain('עריכת עדכונים')
      previewMode.value = null
    })
  })
})
