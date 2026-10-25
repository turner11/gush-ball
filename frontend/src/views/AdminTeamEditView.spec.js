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
  club: null,
  about: 'טקסט',
  about_en: null,
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
    expect(wrapper.find('#team-about').element.tagName).toBe('TEXTAREA')
  })

  it('saves about, sending null when cleared', async () => {
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

    await wrapper.find('#team-about').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patchBody.about).toBeNull()
  })

  it('saving a colorless team untouched sends no colors', async () => {
    let patchBody
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, primary_color: null }),
      'PATCH /api/teams/1': (options) => {
        patchBody = JSON.parse(options.body)
        return jsonRes({ ...TEAM, ...patchBody })
      },
      ...CONTENT_HANDLERS,
    })
    const wrapper = await mountView()

    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patchBody).not.toHaveProperty('primary_color')
    expect(patchBody).not.toHaveProperty('secondary_color')
  })

  it('offers the scraper-suggested league URL and fills the field on "use it"', async () => {
    const SUGGESTED = 'https://ibasketball.co.il/league/2'
    mockFetch({ 'GET /api/teams/1': () => jsonRes({ ...TEAM, league_url_suggestion: SUGGESTED }), ...CONTENT_HANDLERS })

    const wrapper = await mountView()
    expect(wrapper.find('#league-suggestion').text()).toContain(SUGGESTED)

    await wrapper.find('#league-suggestion button').trigger('click')

    expect(wrapper.find('#team-ibasketball_league_url').element.value).toBe(SUGGESTED)
    expect(wrapper.find('#league-suggestion').exists()).toBe(false)
  })

  it('shows no league suggestion when the scraper has none', async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })
    expect((await mountView()).find('#league-suggestion').exists()).toBe(false)
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

  it('offers custom backgrounds from teams of the same club and previews the selection', async () => {
    const A = 'https://cdn.example.com/a.jpg'
    const B = 'https://cdn.example.com/b.jpg'
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, club: 'גוש' }),
      'GET /api/teams': () =>
        jsonRes([
          { ...TEAM, club: 'גוש' },
          { ...TEAM, id: 2, club: 'גוש', background: A },
          { ...TEAM, id: 3, club: 'אחר', background: B },
        ]),
      ...CONTENT_HANDLERS,
    })

    const wrapper = await mountView()
    const values = wrapper.findAll('#team-background option').map((o) => o.element.value)
    expect(values).toContain(A)
    expect(values).not.toContain(B)

    await wrapper.find('#team-background').setValue(A)
    expect(wrapper.find('img[alt="תצוגה מקדימה של הרקע"]').attributes('src')).toBe(A)
  })

  it('sets the background from an upload and from a pasted URL', async () => {
    const U = 'https://cdn.example.com/uploaded.jpg'
    const V = 'https://cdn.example.com/pasted.jpg'
    const patches = []
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'GET /api/teams': () => jsonRes([TEAM]),
      'POST /api/uploads': () => jsonRes({ url: U }),
      'PATCH /api/teams/1': (options) => {
        patches.push(JSON.parse(options.body))
        return jsonRes({ ...TEAM, ...patches.at(-1) })
      },
      ...CONTENT_HANDLERS,
    })

    const wrapper = await mountView()
    const input = wrapper.find('input[aria-label="העלאת תמונת רקע"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'bg.png', { type: 'image/png' })], configurable: true })
    await input.trigger('change')
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patches[0].background).toBe(U)

    await wrapper.find('#team-background-url').setValue(V)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patches[1].background).toBe(V)
  })

  it('a save after a failed save updates the team and shows נשמר', async () => {
    let calls = 0
    mockFetch({
      'GET /api/teams/1': () => jsonRes(TEAM),
      'PATCH /api/teams/1': (options) => {
        calls += 1
        if (calls === 1) return { ok: false, status: 500, statusText: 'x', json: async () => ({}) }
        return jsonRes({ ...TEAM, ...JSON.parse(options.body) })
      },
      ...CONTENT_HANDLERS,
    })

    const wrapper = await mountView()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('שגיאה בעדכון הקבוצה')
    expect(wrapper.text()).not.toContain('נשמר')

    await wrapper.find('#team-name').setValue('קבוצה ב')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).not.toContain('שגיאה בעדכון הקבוצה')
    expect(wrapper.text()).toContain('נשמר')
  })

  it('shows the team admins card to a full admin', async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('מנהלי הקבוצה')
  })

  it('hides the team admins card from a team admin and never requests it', async () => {
    mockFetch({ 'GET /api/teams/1': () => jsonRes(TEAM), ...CONTENT_HANDLERS })
    ;(await import('../composables/useAuth')).useAuth().user.value = { username: 't', team_id: 1, team_ids: [1] }

    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('מנהלי הקבוצה')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1/admins', expect.anything())
  })

  it("shows the team admins card to a club admin of this team's club", async () => {
    mockFetch({
      'GET /api/teams/1': () => jsonRes({ ...TEAM, club: 'Gush' }),
      'GET /api/teams/1/admins': () => jsonRes([]),
      'GET /api/teams/assignable-users': () => jsonRes([]),
      ...CONTENT_HANDLERS,
    })
    ;(await import('../composables/useAuth')).useAuth().user.value = {
      username: 'c', is_admin: true, team_id: null, team_ids: [1, 2], clubs: ['Gush'],
    }

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('מנהלי הקבוצה')
  })

  it('saves club, sending null when cleared', async () => {
    let patchBody
    mockFetch({
      'GET /api/teams': () => jsonRes([{ ...TEAM, club: 'Gush' }]),
      'GET /api/teams/1': () => jsonRes({ ...TEAM, club: 'Gush' }),
      'PATCH /api/teams/1': (options) => {
        patchBody = JSON.parse(options.body)
        return jsonRes({ ...TEAM, ...patchBody })
      },
      ...CONTENT_HANDLERS,
    })
    const wrapper = await mountView()
    expect(wrapper.find('#team-club').element.value).toBe('Gush')
    expect(wrapper.find('#club-options option').element.value).toBe('Gush')

    await wrapper.find('#team-club').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(patchBody.club).toBeNull()
  })

  it('club input is disabled for a scoped admin', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes([]),
      'GET /api/teams/1': () => jsonRes(TEAM),
      ...CONTENT_HANDLERS,
    })
    ;(await import('../composables/useAuth')).useAuth().user.value = { username: 'c', team_id: null, team_ids: [1, 2] }

    const wrapper = await mountView()

    expect(wrapper.find('#team-club').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('רק מנהל ראשי יכול לשנות מועדון')
    expect(wrapper.text()).not.toContain('מנהלי הקבוצה')
  })

  it('explains what the Facebook embed needs under the facebook field', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes([]),
      'GET /api/teams/1': () => jsonRes(TEAM),
      ...CONTENT_HANDLERS,
    })

    const wrapper = await mountView()

    expect(wrapper.find('#team-facebook_url').attributes('aria-describedby')).toBe('team-facebook_url-hint')
    expect(wrapper.find('#team-facebook_url-hint').text()).toContain('ציבורי')
    expect(wrapper.find('#team-instagram_url').attributes('aria-describedby')).toBeUndefined()
  })
})
