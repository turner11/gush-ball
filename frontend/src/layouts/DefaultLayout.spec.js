import { flushPromises, mount } from '@vue/test-utils'
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

describe('DefaultLayout', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    window.history.replaceState({}, '', '/') // jsdom keeps the URL between tests
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div/>' } },
        { path: '/schedule', name: 'schedule', component: { template: '<div/>' } },
        { path: '/roster', name: 'roster', component: { template: '<div/>' } },
        { path: '/:slug', name: 'team-home', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it("bare / redirects to the remembered team's slug", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })
    localStorage.setItem('gush-ball:selected-team-id', '2')
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')

    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_b')
  })

  it('bare / redirects to the first team when nothing is remembered', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })
    const { default: DefaultLayout } = await import('./DefaultLayout.vue')

    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_a')
  })

  it('unknown slug redirects to the remembered/first team', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/nope')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/team_a')
  })

  it('non-home pages never redirect', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/schedule')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/schedule')
  })

  it('renders no team <select>', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('select').exists()).toBe(false)
  })

  it('nav links סטטיסטיקה to the roster page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const a = wrapper.findAll('a').find((x) => x.text() === 'סטטיסטיקה')
    expect(a.attributes('href')).toBe('/roster#lineups')
  })

  it('on /roster only שחקנים is highlighted, not the #lineups link', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/roster')
    await flushPromises()

    const active = wrapper.find('[data-testid="top-nav"]').findAll('a.router-link-exact-active').map((x) => x.text())
    expect(active).toEqual(['שחקנים'])
  })

  it('nav links מדיה to the media page', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const a = wrapper.findAll('a').find((x) => x.text() === 'מדיה')
    expect(a.attributes('href')).toBe('/media')
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
    await flushPromises()

    expect(wrapper.find('[data-testid="hero"]').attributes('style')).toContain('/backgrounds/hoop-1.jpg')

    await router.push('/team_b')
    await flushPromises()

    expect(wrapper.find('[data-testid="hero"]').attributes('style')).toContain('/backgrounds/hoop-2.jpg')
  })

  it('header is sticky and never shows the text club title', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const header = wrapper.find('header')
    expect(header.element.parentElement.classList).toContain('sticky')
    expect(header.element.parentElement.classList).toContain('top-0')
    expect(header.text()).not.toContain('גוש כדורסל')
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

    await router.push('/schedule')
    await flushPromises()
    expect(wrapper.find('[data-testid="hero"]').exists()).toBe(false)
  })

  it('hero shows the team logo and name as the page heading; the map pin lives in the header', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const hero = wrapper.find('[data-testid="hero"]')
    expect(hero.find('a').exists()).toBe(false)
    expect(hero.find('img[src="https://cdn.example.com/logo-a.png"]').exists()).toBe(true)
    expect(hero.find('h1').text()).toBe('קבוצה א')
    const a = wrapper.find('header a[href^="https://www.google.com/maps"]')
    expect(a.attributes('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('אולם הספורט, תל אביב'),
    )
    expect(a.attributes('rel')).toContain('noopener')
  })

  it('mobile tab bar links the five primary destinations', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await router.push('/team_a')
    await flushPromises()

    const hrefs = wrapper
      .find('[data-testid="tab-bar"]')
      .findAll('a')
      .map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/team_a', '/schedule', '/standings', '/roster', '/media'])
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
})
