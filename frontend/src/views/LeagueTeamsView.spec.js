import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OURS = [{ id: 1, name: 'קבוצה שלנו', name_en: 'Team A', logo_url: 'https://cdn.example.com/a.png' }]
const sp = (name, team_id = null) => ({ name, logo_url: null, ibasketball_team_url: `https://x/team/${name}/`, team_id })

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const err = (status, detail) => ({ ok: false, status, statusText: 'err', json: async () => ({ detail }) })
const LEAGUE = { ibasketball_id: 10, name: 'ליגת א', url: 'u' }
const ME = { username: 'dana', display_name: 'Dana', is_admin: false, memberships: [], team_requests: [] }

let calls
// `leagueRes` may be a function (called per request); `extra` adds `METHOD url` handlers, e.g. the POST.
function mockApi(leagueRes, extra = {}, me = err(401)) {
  calls = []
  const all = {
    'GET /api/teams': () => ok(OURS),
    'GET /api/leagues/10/teams': typeof leagueRes === 'function' ? leagueRes : () => leagueRes,
    'GET /api/auth/me': () => me,
    ...extra,
  }
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    calls.push({ key, body: options.body && JSON.parse(options.body) })
    const handler = all[key]
    return handler ? Promise.resolve(handler()) : Promise.reject(new Error(`Unhandled fetch: ${key}`))
  })
}
const called = (key) => calls.filter((c) => c.key === key)
const body = () => new DOMWrapper(document.body) // ConfirmDialog teleports to body

async function mountView(path = '/teams/10') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/teams', name: 'teams', component: { template: '<div/>' } },
      { path: '/teams/:leagueId', name: 'league-teams', component: { template: '<div/>' } },
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/account', name: 'account', component: { template: '<div/>' } },
    ],
  })
  await router.push(path)
  const { default: View } = await import('./LeagueTeamsView.vue')
  const wrapper = mount(View, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

const REQUEST_BUTTON = 'button[aria-label="בקשת הוספה: קבוצה זרה"]'
const confirmButton = () => body().findAll('button').find((b) => b.text() === 'אישור')
const foreignLeague = (extra = {}) => ok({ league: LEAGUE, teams: [{ ...sp('קבוצה זרה'), ...extra }] })

describe('LeagueTeamsView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('links on-site teams to their page with our name and logo; lists the rest unlinked', async () => {
    mockApi(ok({ league: LEAGUE, teams: [sp('SP שלנו', 1), sp('קבוצה זרה')] }))
    const wrapper = await mountView()

    expect(wrapper.find('h1').text()).toBe('ליגת א')
    const link = wrapper.findAll('a').find((a) => a.attributes('href') === '/team_a')
    expect(link.text()).toBe('קבוצה שלנו')
    expect(link.find('img').attributes('src')).toBe('https://cdn.example.com/a.png')
    expect(wrapper.text()).not.toContain('SP שלנו')
    expect(wrapper.text()).toContain('קבוצה זרה')
    expect(wrapper.findAll('a').filter((a) => a.text().includes('קבוצה זרה'))).toHaveLength(0)
  })

  it('404 shows league-not-found with a way back; other errors offer retry', async () => {
    mockApi(err(404))
    let wrapper = await mountView()
    expect(wrapper.text()).toContain('הליגה לא נמצאה')
    expect(wrapper.find('a[href="/teams"]').exists()).toBe(true)

    vi.resetModules()
    let calls = 0
    mockApi(() => (calls++ ? ok({ league: LEAGUE, teams: [sp('x')] }) : err(502)))
    wrapper = await mountView()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('h1').text()).toBe('ליגת א')
  })

  it('empty league shows an empty state', async () => {
    mockApi(ok({ league: LEAGUE, teams: [] }))
    expect((await mountView()).text()).toContain('אין קבוצות בליגה הזו עדיין.')
  })

  it('not-on-site cards show a request button, or a pending badge once requested', async () => {
    mockApi(ok({ league: LEAGUE, teams: [sp('פנויה'), { ...sp('ממתינה'), requested: true }] }))
    const wrapper = await mountView()
    expect(wrapper.find('button[aria-label="בקשת הוספה: פנויה"]').text()).toBe('בקשת הוספה')
    expect(wrapper.find('button[aria-label="בקשת הוספה: ממתינה"]').exists()).toBe(false)
    expect(wrapper.find('.badge-muted').text()).toBe('ממתין לאישור')
  })

  it('an anonymous click goes to login and comes back with ?request=', async () => {
    mockApi(foreignLeague())
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    const { name, query } = wrapper.vm.$router.currentRoute.value
    expect(name).toBe('admin-login')
    expect(query.next).toBe('/teams/10?request=' + encodeURIComponent('https://x/team/קבוצה זרה/'))
  })

  it('an admin previewing as anonymous is sent to login like a visitor, not the confirm', async () => {
    mockApi(foreignLeague(), {}, ok(ME))
    const { previewMode } = await import('../composables/useAuth')
    previewMode.value = 'anonymous'
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.name).toBe('admin-login')
    expect(body().text()).not.toContain('לבקש להוסיף את קבוצה זרה לאתר?')
  })

  it('a ?request= for a signed-in user opens the confirm, and confirming POSTs the team', async () => {
    mockApi(foreignLeague(), { 'POST /api/team-requests': () => ok({ id: 1, name: 'x', status: 'pending' }) }, ok(ME))
    await mountView('/teams/10?request=' + encodeURIComponent('https://x/team/קבוצה זרה/'))
    expect(body().text()).toContain('לבקש להוסיף את קבוצה זרה לאתר?')
    expect(called('POST /api/team-requests')).toHaveLength(0)
    await confirmButton().trigger('click')
    await flushPromises()
    expect(called('POST /api/team-requests')[0].body).toEqual({
      league_id: 10,
      ibasketball_team_url: 'https://x/team/קבוצה זרה/',
    })
  })

  it('a pending response shows the badge, the status and a link to /account', async () => {
    mockApi(foreignLeague(), { 'POST /api/team-requests': () => ok({ id: 1, name: 'x', status: 'pending' }) }, ok(ME))
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(wrapper.find('.badge-muted').text()).toBe('ממתין לאישור')
    expect(wrapper.find('[role="status"]').text()).toContain('הבקשה נשלחה וממתינה לאישור')
    expect(wrapper.find('[role="status"] a').attributes('href')).toBe('/account')
    expect(wrapper.find(REQUEST_BUTTON).exists()).toBe(false)
  })

  it('an approved response reloads the view so the team moves to the site list', async () => {
    let loads = 0
    mockApi(
      () => ok({ league: LEAGUE, teams: [loads++ ? sp('קבוצה זרה', 1) : sp('קבוצה זרה')] }),
      { 'POST /api/team-requests': () => ok({ id: 1, name: 'x', status: 'approved' }) },
      ok(ME),
    )
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(called('GET /api/leagues/10/teams')).toHaveLength(2)
    expect(wrapper.find(REQUEST_BUTTON).exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toContain('הקבוצה נוספה לאתר')
  })

  it('a 409 shows the server message and keeps the button', async () => {
    mockApi(foreignLeague(), { 'POST /api/team-requests': () => err(409, 'יש לך כבר 3 בקשות ממתינות') }, ok(ME))
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(wrapper.find('p.error-text[role="alert"]').text()).toBe('יש לך כבר 3 בקשות ממתינות')
    expect(wrapper.find(REQUEST_BUTTON).exists()).toBe(true)
  })

  it('a 403 shows the server message (unverified email)', async () => {
    mockApi(foreignLeague(), { 'POST /api/team-requests': () => err(403, 'כדי לבקש קבוצה צריך כתובת אימייל מאומתת') }, ok(ME))
    const wrapper = await mountView()
    await wrapper.find(REQUEST_BUTTON).trigger('click')
    await flushPromises()
    await confirmButton().trigger('click')
    await flushPromises()
    expect(wrapper.find('p.error-text[role="alert"]').text()).toBe('כדי לבקש קבוצה צריך כתובת אימייל מאומתת')
    expect(wrapper.find(REQUEST_BUTTON).exists()).toBe(true)
  })
})
