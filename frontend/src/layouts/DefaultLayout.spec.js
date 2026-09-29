import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [
  {
    id: 1,
    name: 'קבוצה א',
    primary_color: '#ffff00',
    secondary_color: '#000000',
    logo_url: 'https://cdn.example.com/logo-a.png',
    home_court_address: 'אולם הספורט, תל אביב',
  },
  { id: 2, name: 'קבוצה ב', primary_color: '#1d428a', secondary_color: '#c8102e', background: 'hoop-2' },
  { id: 3, name: 'קבוצה ג', primary_color: null, secondary_color: null },
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
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads teams on mount and defaults selectedTeamId to the first team', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const select = wrapper.find('#team-switcher')
    expect(select.exists()).toBe(true)
    expect(select.element.value).toBe('1')
  })

  it('changing the team switcher updates the shared selectedTeamId', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#team-switcher').setValue('2')
    await flushPromises()

    expect(localStorage.getItem('gush-ball:selected-team-id')).toBe('2')
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

    await wrapper.find('#team-switcher').setValue('2')
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

    await wrapper.find('#team-switcher').setValue('3')
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

    await wrapper.find('#team-switcher').setValue('3')
    await flushPromises()

    expect(header.classes()).not.toContain('bg-team')
    expect(header.classes()).not.toContain('text-on-team')
    expect(header.classes()).toContain('border-neutral-200')
  })

  it("renders the selected team's background in the hero, falling back to hoop-1", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="hero"]').attributes('style')).toContain('/backgrounds/hoop-1.jpg')

    await wrapper.find('#team-switcher').setValue('2')
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

    const brand = wrapper.find('header a[href="/"]')
    const img = brand.find('img[src="https://cdn.example.com/logo-a.png"]')
    expect(img.exists()).toBe(true)
    expect(brand.text()).toContain('קבוצה א')
    const row = Array.from(brand.element.children)
    const name = row.find((el) => el.textContent.includes('קבוצה א'))
    expect(row.indexOf(img.element)).toBeLessThan(row.indexOf(name))

    await wrapper.find('#team-switcher').setValue('2')
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

  it('hero stays pinned with the header', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const parent = wrapper.find('header').element.parentElement
    expect(wrapper.find('[data-testid="hero"]').element.parentElement).toBe(parent)
  })

  it("hero shows only the map link, not the team logo or name", async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    const hero = wrapper.find('[data-testid="hero"]')
    expect(hero.find('img').exists()).toBe(false)
    expect(hero.text()).not.toContain('קבוצה א')
    const a = hero.find('a')
    expect(a.attributes('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('אולם הספורט, תל אביב'),
    )
    expect(a.attributes('rel')).toContain('noopener')
  })

  it('hero omits the map link when the team has no address', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: DefaultLayout } = await import('./DefaultLayout.vue')
    const wrapper = mount(DefaultLayout, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('#team-switcher').setValue('3')
    await flushPromises()

    const hero = wrapper.find('[data-testid="hero"]')
    expect(hero.text()).not.toContain('קבוצה ג')
    expect(hero.find('img').exists()).toBe(false)
    expect(hero.find('a').exists()).toBe(false)
  })
})
