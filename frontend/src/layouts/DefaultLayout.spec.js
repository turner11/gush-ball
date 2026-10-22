import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [
  {
    id: 1,
    name: 'קבוצה א',
    name_en: 'Team A',
    primary_color: '#ffff00',
    secondary_color: '#000000',
    logo_url: 'https://cdn.example.com/logo-a.png',
    home_court_address: 'אולם הספורט, תל אביב',
    ibasketball_team_url: 'https://ibasketball.co.il/team/a/',
  },
  { id: 2, name: 'קבוצה ב', name_en: 'Team B', primary_color: '#1d428a', secondary_color: '#c8102e', background: 'hoop-2' },
  { id: 3, name: 'קבוצה ג', name_en: 'Team C', primary_color: null, secondary_color: null },
]

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

const unauthorized = { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ detail: 'x' }) }

const IBBA = 'https://ibasketball.co.il/team/a/'
const ADMIN = { 'GET /api/auth/me': () => jsonRes({ username: 'admin', display_name: 'admin', is_admin: true }) }

// Reka menus portal to <body>; open via keyboard (the AdminHomeView.spec pattern).
async function openMenu(trigger) {
  await trigger.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return new DOMWrapper(document.body)
}

describe('DefaultLayout', () => {
  let router

  beforeEach(() => {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = '/logo.jpg'
    document.head.appendChild(icon)
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1') // the old implicit default the tests below rely on
    window.history.replaceState({}, '', '/') // jsdom keeps the URL between tests
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div/>' } },
        { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' }, meta: { title: 'לוח', description: (t) => `לוח של ${t}` } },
        { path: '/clubs/:clubSlug', name: 'club', component: { template: '<div/>' } },
        { path: '/:slug/stats', name: 'stats', component: { template: '<div/>' } },
        { path: '/players/:id', name: 'player', component: { template: '<div/>' } },
        { path: '/teams', name: 'teams', component: { template: '<div/>' } },
        { path: '/admin', name: 'admin-home', component: { template: '<div/>' } },
        { path: '/join', name: 'join', component: { template: '<div/>' } },
        { path: '/account', name: 'account', component: { template: '<div/>' } },
        { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
        { path: '/:slug/roster', name: 'roster', component: { template: '<div/>' } },
        { path: '/:slug/media', name: 'media', component: { template: '<div/>' } },
        { path: '/gone/:rest(.*)*', name: 'not-found', component: { template: '<div/>' }, meta: { noindex: true } },
        { path: '/:slug', name: 'team-home', component: { template: '<div/>' }, meta: { description: (t) => `בית ${t}` } },
      ],
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.title = ''
    document.querySelector('link[rel="icon"]')?.remove()
    document.head.querySelectorAll('meta[name], link[rel="canonical"], script[data-page]').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('sets meta description from route meta with the selected team name', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a/schedule')
    await flushPromises()

    expect(document.head.querySelector('meta[name="description"]').content).toBe('לוח של קבוצה א')
  })

  it('header links to the teams index', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a/schedule')
    await flushPromises()

    expect(wrapper.find('header a[href="/teams"]').attributes('aria-label')).toBe('כל הקבוצות')
  })

  it('teams icon stays visible on desktop when no team is selected', async () => {
    localStorage.removeItem('gush-ball:selected-team-id')
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/teams')
    await flushPromises()

    expect(wrapper.find('header a[href="/teams"]').classes()).not.toContain('lg:hidden')
  })

  it('canonical is origin + path, query dropped', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a/schedule?x=1')
    await flushPromises()

    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${location.origin}/team_a/schedule`)
  })

  it('not-found route sets robots noindex and removes canonical; navigating away clears noindex', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a/schedule')
    await flushPromises()
    await router.push('/gone/x')
    await flushPromises()

    expect(document.head.querySelector('meta[name="robots"]').content).toBe('noindex')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()

    await router.push('/team_a/schedule')
    await flushPromises()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
    expect(document.head.querySelector('link[rel="canonical"]')).not.toBeNull()
  })

  it('team home gets SportsTeam JSON-LD; /schedule removes it', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const ld = JSON.parse(document.head.querySelector('script[type="application/ld+json"][data-page]').textContent)
    expect(ld['@type']).toBe('SportsTeam')
    expect(ld.name).toBe('קבוצה א')
    expect(ld.url).toBe(`${location.origin}/team_a`)

    await router.push('/team_a/schedule')
    await flushPromises()
    expect(document.head.querySelector('script[data-page]')).toBeNull()
  })

  it('visiting /team_b selects team 2 and remembers it', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_b')
    await flushPromises()

    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('2')
    expect(wrapper.find('header a').text()).toContain('קבוצה ב')
  })

  it('sets the tab title to the selected team name', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_b')
    await flushPromises()

    expect(document.title).toBe('קבוצה ב · Team B · כדורסל')
  })

  it('tab title follows a team switch', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()
    await router.push('/team_a/schedule')
    await flushPromises()
    expect(document.title).toBe('לוח · קבוצה א · Team A · כדורסל')

    await router.push('/team_b')
    await flushPromises()
    expect(document.title).toBe('קבוצה ב · Team B · כדורסל')
  })

  it('header shows the English name under the name, and nothing without name_en', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS.map((t) => (t.id === 2 ? { ...t, name_en: null } : t))) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()
    expect(wrapper.find('header a bdi[lang="en"]').text()).toBe('Team A')

    await router.push('/2')
    await flushPromises()
    expect(wrapper.find('header a bdi').exists()).toBe(false)
  })

  it('on the player route the layout leaves the title and JSON-LD to PlayerView', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.setAttribute('data-page', '')
    ld.textContent = '{"@type":"Person"}'
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/players/3')
    await flushPromises()
    document.title = 'player title' // as PlayerView sets it
    document.head.appendChild(ld)
    await router.push('/players/4') // head watcher reruns with teams loaded
    await flushPromises()

    expect(document.title).toBe('player title')
    expect(document.head.querySelector('script[data-page]').textContent).toBe('{"@type":"Person"}')
  })

  it("tab icon is the selected team's logo, club logo when it has none", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    const icon = () => document.querySelector('link[rel="icon"]').getAttribute('href')
    await router.push('/team_a')
    await flushPromises()
    expect(icon()).toBe(TEAMS[0].logo_url)

    await router.push('/team_b')
    await flushPromises()
    expect(icon()).toBe('/logo.jpg')
  })

  it("bare / redirects to the remembered team's slug", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })
    localStorage.setItem('gush-ball:selected-team-id', '2')
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')

    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_b')
  })

  it('a failed /api/teams keeps the remembered team', async () => {
    mockFetch({ 'GET /api/teams': () => ({ ok: false, status: 503, statusText: 'Unavailable', json: async () => ({}) }) })
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')

    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/teams')
    await flushPromises()

    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('1')
    expect(wrapper.find('[data-testid="top-nav"]').exists()).toBe(true) // remembered team keeps the nav
  })

  it('a first-time visitor on a slug-less page gets no team', async () => {
    localStorage.clear()
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')

    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/teams')
    await flushPromises()

    expect(wrapper.find('header').classes()).not.toContain('bg-team')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBeNull()
    // nothing chosen: every nav link would bounce back to /teams, so hide them
    expect(wrapper.find('[data-testid="top-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tab-bar"]').exists()).toBe(false)
  })

  it('unknown slug redirects to the remembered team', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/nope')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_a')
  })

  it('unknown slug with no remembered team goes to /teams and remembers nothing (#358)', async () => {
    localStorage.clear()
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/nope/stats?game=5')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/teams')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBeNull()
  })

  it('bare / with a deleted remembered team goes to /teams and remembers nothing (#358)', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '99')
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/teams')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBeNull()
  })

  it("/<id> redirects to that team's canonical slug and selects it", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/2')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_b')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('2')
  })

  it('a name_en slug that is all digits wins over a team id', async () => {
    const teams = [{ id: 1, name: 'א', name_en: 'Team A' }, { id: 2, name: 'ב', name_en: '1' }]
    mockFetch({ 'GET /api/teams': () => jsonRes(teams) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/1')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/1')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('2')
  })

  it('unknown numeric id falls back to the remembered team', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/99')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_a')
  })

  it('slug-less pages never redirect', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/players/1')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/players/1')
  })

  it('visiting /team_b/schedule selects team 2', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_b/schedule')
    await flushPromises()

    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('2')
    expect(wrapper.find('header a').text()).toContain('קבוצה ב')
  })

  it('unknown slug on a team page keeps the page and query', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/nope/stats?game=5')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/team_a/stats?game=5')

    await router.push('/2/schedule')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/team_b/schedule')
  })

  it('nav, tab bar and ניהול links carry the team slug', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), 'GET /api/auth/me': () => jsonRes({ username: 'admin', display_name: 'admin', is_admin: true }) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const nav = wrapper.find('[data-testid="top-nav"]').findAll('a').map((a) => a.attributes('href'))
    expect(nav).toEqual(['/team_a/schedule', '/team_a/standings', '/team_a/roster', '/team_a/media', '/team_a/stats'])
    const body = await openMenu(wrapper.find('button[aria-label$="תפריט חשבון"]'))
    expect(body.find('[role=menuitem][href="/team_a/admin"]').text()).toBe('ניהול')
  })

  it.each([
    ['a member of the team', [1], true],
    ['a member of another team', [2], false],
    ['anonymous', undefined, false],
  ])('playbook link in nav and tab bar for %s: shown=%s', async (_n, ids, shown) => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/auth/me': () => (ids ? jsonRes({ username: 'p', member_team_ids: ids }) : unauthorized),
    })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    for (const id of ['top-nav', 'tab-bar']) {
      const hrefs = wrapper.find(`[data-testid="${id}"]`).findAll('a').map((a) => a.attributes('href'))
      expect(hrefs.includes('/team_a/playbook')).toBe(shown)
    }
  })

  it('"בית" is a menu button, never inline links; its menu links team home and the IBBA page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await router.push('/team_a/schedule')
    await flushPromises()

    const nav = wrapper.find('[data-testid="top-nav"]')
    const trigger = nav.find('button[aria-haspopup="menu"]')
    expect(trigger.text()).toContain('בית')
    expect(nav.find('a[href="/team_a"]').exists()).toBe(false)

    const body = await openMenu(trigger)
    expect(body.find('[role=menuitem][href="/team_a"]').exists()).toBe(true)
    const ibba = body.find(`[role=menuitem][href="${IBBA}"]`)
    expect(ibba.attributes('target')).toBe('_blank')
    expect(ibba.attributes('rel')).toContain('noopener')
    expect(body.find('[role=menuitem][href="/teams"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('Home menu omits the IBBA item when the team has no ibasketball URL', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await router.push('/team_c')
    await flushPromises()

    const body = await openMenu(wrapper.find('[data-testid="top-nav"] button[aria-haspopup="menu"]'))
    expect(body.find('[role=menuitem][href="/team_c"]').exists()).toBe(true)
    expect(body.find('[role=menuitem][target="_blank"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('team name is never truncated', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    expect(wrapper.find('header a[href="/team_a"] .truncate').exists()).toBe(false)
    expect(wrapper.find('header > div').classes()).not.toContain('md:h-16')
  })

  it('swaps tab bar for top nav at lg, not md: the md header has no room for the links (#341)', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="top-nav"]').classes()).toEqual(expect.arrayContaining(['hidden', 'lg:block']))
    expect(wrapper.find('[data-testid="tab-bar"]').classes()).toContain('lg:hidden')
    expect(wrapper.find('[data-testid="tab-bar"]').classes()).not.toContain('md:hidden')
  })

  it('renders no team <select>', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('nav links סטטיסטיקה to the stats page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const a = wrapper.findAll('a').find((x) => x.text() === 'סטטיסטיקה')
    expect(a.attributes('href')).toBe('/team_a/stats')
  })

  it('nav links מדיה to the media page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const a = wrapper.findAll('a').find((x) => x.text() === 'מדיה')
    expect(a.attributes('href')).toBe('/team_a/media')
  })

  it("exposes the selected team's colors as CSS custom properties", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const style = wrapper.element.style
    expect(style.getPropertyValue('--team-primary')).toBe('#ffff00')
    expect(style.getPropertyValue('--team-on-primary')).toBe('#000000')
  })

  it('updates the custom properties when the switcher changes', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    await router.push('/team_b')
    await flushPromises()

    const style = wrapper.element.style
    expect(style.getPropertyValue('--team-primary')).toBe('#1d428a')
    expect(style.getPropertyValue('--team-on-primary')).toBe('#ffffff')
    expect(style.getPropertyValue('--team-secondary')).toBe('#c8102e')
  })

  it('leaves the vars unset for a team without colors', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    await router.push('/team_c')
    await flushPromises()

    expect(wrapper.element.style.getPropertyValue('--team-primary')).toBe('')
  })

  it('keeps the neutral header (no team band) for a team without colors', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const header = wrapper.find('header')
    expect(header.classes()).toContain('bg-team')

    await router.push('/team_c')
    await flushPromises()

    expect(header.classes()).not.toContain('bg-team')
    expect(header.classes()).not.toContain('text-on-team')
    expect(header.classes()).toContain('bg-brand')
  })

  it("renders the selected team's background in the hero, falling back to hoop-1", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    expect(wrapper.find('[data-testid="hero"]').attributes('style')).toContain('/backgrounds/hoop-1.jpg')

    await router.push('/team_b')
    await flushPromises()

    expect(wrapper.find('[data-testid="hero"]').attributes('style')).toContain('/backgrounds/hoop-2.jpg')
  })

  it('renders a custom background URL in the hero', async () => {
    const url = 'https://cdn.example.com/bg.jpg'
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS.map((t) => ({ ...t, background: url }))) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const style = wrapper.find('[data-testid="hero"]').attributes('style')
    expect(style).toContain(url)
    expect(style).not.toContain('/backgrounds/')
  })

  it('header is sticky and never shows the text club title', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const header = wrapper.find('header')
    expect(header.element.parentElement.classList).toContain('sticky')
    expect(header.element.parentElement.classList).toContain('top-0')
    expect(header.text()).not.toContain('GushBall')
  })

  it('header brand shows the selected team logo and name', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const brand = wrapper.find('header a[href="/team_a"]')
    const img = brand.find('img[src="https://cdn.example.com/logo-a.png"]')
    expect(img.exists()).toBe(true)
    expect(brand.text()).toContain('קבוצה א')
    const row = Array.from(brand.element.children)
    const name = row.find((el) => el.textContent.includes('קבוצה א'))
    expect(row.indexOf(img.element)).toBeLessThan(row.indexOf(name))

    await router.push('/team_b')
    await flushPromises()

    expect(brand.find('img[src="/logo.jpg"]').exists()).toBe(true)
    expect(brand.text()).toContain('קבוצה ב')
  })

  it('has no footer', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('footer').exists()).toBe(false)
  })

  it('hero renders only on home routes, outside the sticky header', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const hero = wrapper.find('[data-testid="hero"]')
    expect(hero.exists()).toBe(true)
    expect(hero.element.parentElement).not.toBe(wrapper.find('header').element.parentElement)

    await router.push('/team_a/schedule')
    await flushPromises()
    expect(wrapper.find('[data-testid="hero"]').exists()).toBe(false)
  })

  it('hero carries no second logo; the name is a screen-reader heading; the map pin lives in the header', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const hero = wrapper.find('[data-testid="hero"]')
    expect(hero.find('a').exists()).toBe(false)
    expect(hero.find('img').exists()).toBe(false)
    expect(hero.find('h1.sr-only').text()).toBe('קבוצה א')
    const a = wrapper.find('header a[href^="https://www.google.com/maps"]')
    expect(a.attributes('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('אולם הספורט, תל אביב'),
    )
    expect(a.attributes('rel')).toContain('noopener')
  })

  it('mobile tab bar links the six primary destinations', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const hrefs = wrapper
      .find('[data-testid="tab-bar"]')
      .findAll('a')
      .map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/team_a', '/team_a/schedule', '/team_a/standings', '/team_a/roster', '/team_a/media', '/team_a/stats'])
  })

  it.each([
    ['a club', 'מכבי', true],
    ['no club', null, false],
  ])('nav and tab bar link מועדון to the club page for a team with %s', async (_n, club, shown) => {
    const teams = TEAMS.map((t, i) => (i === 0 ? { ...t, club } : t))
    mockFetch({ 'GET /api/teams': () => jsonRes(teams), 'GET /api/clubs': () => jsonRes([{ id: 5, name: 'מכבי', name_en: 'Maccabi' }]) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    for (const id of ['top-nav', 'tab-bar']) {
      const hrefs = wrapper.find(`[data-testid="${id}"]`).findAll('a').map((a) => a.attributes('href'))
      expect(hrefs.includes('/clubs/maccabi')).toBe(shown)
      // top-nav's Home is a menu button, so its first link is the schedule
      if (shown) expect(hrefs.slice(0, 3)).toEqual(id === 'top-nav' ? ['/team_a/schedule', '/clubs/maccabi', '/team_a/standings'] : ['/team_a', '/team_a/schedule', '/clubs/maccabi'])
    }
    const ld = JSON.parse(document.head.querySelector('script[data-page]').textContent)
    if (shown) expect(ld.memberOf.url).toBe(`${location.origin}/clubs/maccabi`)
    else expect(ld).not.toHaveProperty('memberOf')
  })

  it('header omits the map link when the team has no address', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    await router.push('/team_c')
    await flushPromises()

    expect(wrapper.find('header a[href*="google.com/maps"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="hero"]').find('a').exists()).toBe(false)
  })

  it('shows a login link to /admin/login when logged out', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), 'GET /api/auth/me': () => unauthorized })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const header = wrapper.find('header')
    expect(header.find('a[href="/admin/login"]').attributes('aria-label')).toBe('כניסה')
    expect(header.find('a[href="/admin"]').exists()).toBe(false)
    expect(header.find('button[aria-label="התנתקות"]').exists()).toBe(false)
  })

  it('shows management, account and logout only inside the account menu when logged in', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), ...ADMIN })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()

    const header = wrapper.find('header')
    expect(header.find('a[href="/team_a/admin"]').exists()).toBe(false)
    expect(header.find('a[href="/account"]').exists()).toBe(false)
    expect(header.find('button[aria-label="התנתקות"]').exists()).toBe(false)
    expect(header.find('a[href="/admin/login"]').exists()).toBe(false)

    const body = await openMenu(header.find('button[aria-label="admin — תפריט חשבון"]'))
    expect(body.find('[role=menuitem][href="/team_a/admin"]').text()).toBe('ניהול')
    expect(body.find('[role=menuitem][href="/account"]').text()).toBe('החשבון שלי')
    expect(body.findAll('[role=menuitem]').some((m) => m.text() === 'התנתקות')).toBe(true)
    wrapper.unmount()
  })

  it('hides ניהול for a non-admin but shows account and logout in the menu', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/auth/me': () => jsonRes({ username: 'player', display_name: 'Dana C', is_admin: false, team_ids: [] }),
    })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()

    const body = await openMenu(wrapper.find('header button[aria-label="Dana C — תפריט חשבון"]'))
    expect(body.find('[role=menuitem][href="/team_a/admin"]').exists()).toBe(false)
    expect(body.find('[role=menuitem][href="/account"]').exists()).toBe(true)
    expect(body.findAll('[role=menuitem]').some((m) => m.text() === 'התנתקות')).toBe(true)
    wrapper.unmount()
  })

  it('logout posts /auth/logout, swaps to the login link and stays on the page', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/auth/me': () => jsonRes({ username: 'admin', is_admin: true }),
      'POST /api/auth/logout': () => jsonRes({}),
    })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await router.push('/team_a/schedule')
    await flushPromises()
    const body = await openMenu(wrapper.find('header button[aria-label$="תפריט חשבון"]'))
    await body.findAll('[role=menuitem]').find((m) => m.text() === 'התנתקות').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
    expect(wrapper.find('header a[href="/admin/login"]').exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/team_a/schedule')
  })

  it('admin menu toggles view-as-player and shows an exit banner', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS), ...ADMIN })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await router.push('/team_a/schedule')
    await flushPromises()
    expect(wrapper.find('[role=status]').exists()).toBe(false)
    const body = await openMenu(wrapper.find('header button[aria-label$="תפריט חשבון"]'))
    await body.findAll('[role=menuitem]').find((m) => m.text() === 'תצוגה כשחקן').trigger('click')
    await flushPromises()

    const banner = wrapper.find('[role=status]')
    expect(banner.exists()).toBe(true)
    await banner.findAll('button').find((b) => b.text() === 'חזרה לתצוגת מנהל').trigger('click')
    expect(wrapper.find('[role=status]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('a non-admin account menu has no view-as-player item', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'GET /api/auth/me': () => jsonRes({ username: 'p', display_name: 'p', is_admin: false }),
    })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] }, attachTo: document.body })
    await router.push('/team_a/schedule')
    await flushPromises()
    const body = await openMenu(wrapper.find('header button[aria-label$="תפריט חשבון"]'))
    expect(body.findAll('[role=menuitem]').some((m) => m.text() === 'תצוגה כשחקן')).toBe(false)
    wrapper.unmount()
  })
})
