import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/join', name: 'join', component: { template: '<div/>' } },
      { path: '/:slug/stats', name: 'stats', component: { template: '<div/>' } },
      { path: '/admin', name: 'admin-home', component: { template: '<div/>' } },
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/admin/reset-password', name: 'admin-reset-password', component: { template: '<div/>' } },
      { path: '/admin/signup', name: 'admin-signup', component: { template: '<div/>' } },
    ],
  })
}

async function mountLogin(path, optionsFetch) {
  global.fetch = vi.fn(optionsFetch)
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const { default: LoginView } = await import('./LoginView.vue')
  const wrapper = mount(LoginView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const GOOGLE_HREF = 'a[href="/api/auth/google/login"]'
const byUrl = (url, isAdmin = true) =>
  url === '/api/auth/me'
    ? Promise.resolve({ ok: true, status: 200, json: async () => ({ username: 'a', team_id: null, is_admin: isAdmin }) })
    : Promise.resolve({ ok: true, status: 200, json: async () => ({ google: true }) })
const asPlayer = (url) => byUrl(url, false)

async function clickGoogle(wrapper) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  wrapper.find(GOOGLE_HREF).element.dispatchEvent(event)
  await flushPromises()
  return event
}

const options = (body) => () => Promise.resolve({ ok: true, status: 200, json: async () => body })

describe('LoginView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('shows the Google link when the backend enables it', async () => {
    const wrapper = await mountLogin('/admin/login', options({ google: true }))
    expect(global.fetch.mock.calls[0][0]).toBe('/api/auth/options')
    expect(wrapper.find('a[href="/api/auth/google/login"]').exists()).toBe(true)
  })

  it('hides the Google link when disabled or when the options fetch fails', async () => {
    let wrapper = await mountLogin('/admin/login', options({ google: false }))
    expect(wrapper.find('a[href="/api/auth/google/login"]').exists()).toBe(false)
    vi.resetModules()
    wrapper = await mountLogin('/admin/login', () => Promise.reject(new Error('down')))
    expect(wrapper.find('a[href="/api/auth/google/login"]').exists()).toBe(false)
  })

  it('shows the Google error alert for ?error=google', async () => {
    const wrapper = await mountLogin('/admin/login?error=google', options({ google: false }))
    expect(wrapper.find('[role="alert"]').text()).toContain('הכניסה עם Google נכשלה')
  })

  it('a non-admin password login goes to join', async () => {
    const wrapper = await mountLogin('/admin/login', (url) =>
      url === '/api/auth/login'
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ username: 'p', is_admin: false }) })
        : byUrl(url),
    )
    await wrapper.find('#username').setValue('p')
    await wrapper.find('#password').setValue('password123')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.vm.$router.currentRoute.value.name).toBe('join'))
  })

  const login = (isAdmin) => (url) =>
    url === '/api/auth/login'
      ? Promise.resolve({ ok: true, status: 200, json: async () => ({ username: 'p', is_admin: isAdmin }) })
      : byUrl(url, isAdmin)

  async function submitLogin(path, isAdmin) {
    const wrapper = await mountLogin(path, login(isAdmin))
    await wrapper.find('#username').setValue('p')
    await wrapper.find('#password').setValue('password123')
    await wrapper.find('form').trigger('submit')
    return wrapper
  }

  it.each([false, true])('password login (admin=%s) with ?next= goes back there', async (isAdmin) => {
    const wrapper = await submitLogin('/admin/login?next=/elizur/stats?game=3', isAdmin)
    await vi.waitFor(() => expect(wrapper.vm.$router.currentRoute.value.fullPath).toBe('/elizur/stats?game=3'))
  })

  it.each(['//evil.com', 'https://evil.com', String.raw`/\evil.com`])('ignores the external next %s', async (bad) => {
    const wrapper = await submitLogin(`/admin/login?next=${encodeURIComponent(bad)}`, false)
    await vi.waitFor(() => expect(wrapper.vm.$router.currentRoute.value.name).toBe('join'))
  })

  it('tells players to sign up with Google when it is enabled', async () => {
    const wrapper = await mountLogin('/admin/login', options({ google: true }))
    expect(wrapper.text()).toContain('שחקנים: היכנסו עם Google')
  })

  it('links to the forgot-password page', async () => {
    const wrapper = await mountLogin('/admin/login', options({ google: false }))
    expect(wrapper.find('a[href="/admin/reset-password"]').exists()).toBe(true)
  })

  it('the sign-up link keeps next', async () => {
    const wrapper = await mountLogin('/admin/login?next=/teams/10', options({ google: false }))
    expect(wrapper.find('a[href="/admin/signup?next=%2Fteams%2F10"]').exists()).toBe(true)
  })

  it('links to sign-up', async () => {
    const wrapper = await mountLogin('/admin/login', options({ google: false }))
    expect(wrapper.find('a[href="/admin/signup"]').exists()).toBe(true)
  })

  describe('Google popup', () => {
    let channel
    beforeEach(() => {
      channel = new BroadcastChannel('google-signin')
    })
    afterEach(() => channel.close())

    it('opens Google in a popup instead of navigating', async () => {
      window.open = vi.fn(() => ({ closed: false }))
      const wrapper = await mountLogin('/admin/login', byUrl)
      const event = await clickGoogle(wrapper)
      expect(window.open).toHaveBeenCalledWith(
        '/api/auth/google/login?popup=1',
        'google-signin',
        expect.stringContaining('popup'),
      )
      expect(event.defaultPrevented).toBe(true)
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('falls back to the full-page redirect when the popup is blocked', async () => {
      window.open = vi.fn(() => null)
      const wrapper = await mountLogin('/admin/login', byUrl)
      expect((await clickGoogle(wrapper)).defaultPrevented).toBe(false)
      wrapper.unmount()
    })

    it('without BroadcastChannel still renders and the Google link does a full-page redirect', async () => {
      vi.stubGlobal('BroadcastChannel', undefined)
      window.open = vi.fn(() => ({ closed: false }))
      const wrapper = await mountLogin('/admin/login', byUrl)
      expect(wrapper.find('form').exists()).toBe(true)
      expect((await clickGoogle(wrapper)).defaultPrevented).toBe(false)
      expect(window.open).not.toHaveBeenCalled()
      wrapper.unmount()
      vi.unstubAllGlobals()
    })

    it('goes to admin when the popup reports success', async () => {
      const wrapper = await mountLogin('/admin/login', byUrl)
      const router = wrapper.vm.$router
      channel.postMessage(true)
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('admin-home'))
      expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/auth/me')
      wrapper.unmount()
    })

    it('goes to join when the popup reports success for a non-admin', async () => {
      const wrapper = await mountLogin('/admin/login', asPlayer)
      const router = wrapper.vm.$router
      channel.postMessage(true)
      await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('join'))
      wrapper.unmount()
    })

    it('goes to next when the popup reports success', async () => {
      const wrapper = await mountLogin('/admin/login?next=/elizur/stats', asPlayer)
      const router = wrapper.vm.$router
      channel.postMessage(true)
      await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/elizur/stats'))
      wrapper.unmount()
    })

    it('keeps next in the query when the popup reports failure', async () => {
      const wrapper = await mountLogin('/admin/login?next=/elizur/stats', byUrl)
      channel.postMessage(false)
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
      expect(wrapper.vm.$router.currentRoute.value.query).toEqual({ next: '/elizur/stats', error: 'google' })
      wrapper.unmount()
    })

    it('shows the Google error when the popup reports failure', async () => {
      const wrapper = await mountLogin('/admin/login', byUrl)
      channel.postMessage(false)
      await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).toContain('הכניסה עם Google נכשלה'))
      wrapper.unmount()
    })

    it('popup landing posts the result and closes', async () => {
      const received = []
      channel.onmessage = ({ data }) => received.push(data)
      window.close = vi.fn()
      const wrapper = await mountLogin('/admin/login?google_popup=ok', byUrl)
      await vi.waitFor(() => expect(received).toEqual([true]))
      expect(window.close).toHaveBeenCalled()
      await vi.waitFor(() => expect(wrapper.vm.$router.currentRoute.value.name).toBe('admin-home'))
      wrapper.unmount()
    })
  })
})
