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
      'GET /api/teams': () => jsonRes(TEAMS),
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

  it('shows an empty state when there are no teams in the DB', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes([]),
    })

    const { default: HomeView } = await import('./HomeView.vue')
    const wrapper = mount(HomeView, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('אין קבוצות במערכת עדיין')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1', expect.anything())
  })
})
