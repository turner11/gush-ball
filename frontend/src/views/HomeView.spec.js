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
      routes: [{ path: '/', component: { template: '<div/>' } }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the selected team's profile and content (logo, home court, links, posts)", async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'GET /api/teams/1/videos': () => jsonRes(VIDEOS),
      'GET /api/teams/1/images': () => jsonRes(IMAGES),
      'GET /api/teams/1/posts': () => jsonRes(POSTS),
    })

    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.text()).toContain('אולם הספורט, תל אביב')
    expect(wrapper.text()).toContain('אתר הליגה')
    expect(wrapper.text()).toContain('עדכון עונה')
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
  async function mountWithTeam(team) {
    mockFetch({
      'GET /api/teams/1': () => jsonRes(team),
      'GET /api/teams/1/links': () => jsonRes([]),
      'GET /api/teams/1/videos': () => jsonRes([]),
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/posts': () => jsonRes([]),
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
        [1, 2].flatMap((id) => ['links', 'videos', 'images', 'posts'].map((r) => [`GET /api/teams/${id}/${r}`, () => jsonRes([])])),
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
})
