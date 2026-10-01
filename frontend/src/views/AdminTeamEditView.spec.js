import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAM = {
  id: 1,
  name: 'קבוצה א',
  name_en: 'Team A',
  slug: 'team-a',
  primary_color: '#ff0000',
  secondary_color: null,
  background: 'hoop-1',
  logo_url: null,
  home_court_address: 'אולם הספורט',
  facebook_url: 'https://www.facebook.com/gushclub',
  instagram_url: null,
  youtube_url: null,
  tiktok_url: null,
  twitter_url: null,
  ibasketball_team_url: null,
  ibasketball_league_url: 'https://ibasketball.co.il/league/1',
}

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler(options))
  })
}

function jsonRes(body, status = 200) {
  return { ok: true, status, json: async () => body }
}

const CONTENT_HANDLERS = Object.fromEntries(
  ['links', 'videos', 'images', 'posts', 'players', 'admins'].map((r) => [`GET /api/teams/1/${r}`, () => jsonRes([])]),
)

describe('AdminTeamEditView', () => {
  let router

  beforeEach(async () => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/admin/teams/:id', component: { template: '<div/>' } }],
    })
    router.push('/admin/teams/1')
    await router.isReady()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountView() {
    const { default: AdminTeamEditView } = await import('./AdminTeamEditView.vue')
    const wrapper = mount(AdminTeamEditView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it("prefills every field from the team's saved values", async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })

    const wrapper = await mountView()

    const textKeys = Object.keys(TEAM).filter((k) => !['id', 'slug'].includes(k) && !k.endsWith('_color'))
    for (const key of textKeys) {
      expect(wrapper.find(`#team-${key}`).element.value, key).toBe(TEAM[key] ?? '')
    }
    expect(wrapper.find('#team-primary-color').element.value).toBe('#ff0000')
  })

  it('PATCHes edited fields and omits the empty ones', async () => {
    let patchBody
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'PATCH /api/teams/1': (options) => {
        patchBody = JSON.parse(options.body)
        return jsonRes({ ...TEAM, ...patchBody })
      },
      ...CONTENT_HANDLERS,
    })

    const wrapper = await mountView()
    await wrapper.find('#team-instagram_url').setValue('https://www.instagram.com/gushclub')
    await wrapper.find('#team-name').setValue('קבוצה ב')
    await wrapper.find('#team-background').setValue('hoop-2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patchBody).toMatchObject({
      name: 'קבוצה ב',
      background: 'hoop-2',
      instagram_url: 'https://www.instagram.com/gushclub',
      facebook_url: TEAM.facebook_url,
      ibasketball_league_url: TEAM.ibasketball_league_url,
    })
    expect(patchBody).not.toHaveProperty('youtube_url')
  })

  it('shows the team admins card to a full admin', async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('מנהלי הקבוצה')
  })

  it('hides the team admins card from a team admin and never requests it', async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })
    ;(await import('../composables/useAuth')).useAuth().user.value = { username: 't', team_id: 1 }

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('מנהלי הקבוצה')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1/admins', expect.anything())
  })
})
