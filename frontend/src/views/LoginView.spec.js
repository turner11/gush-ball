import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/admin', name: 'admin-home', component: { template: '<div/>' } },
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/admin/reset-password', name: 'admin-reset-password', component: { template: '<div/>' } },
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

  it('links to the forgot-password page', async () => {
    const wrapper = await mountLogin('/admin/login', options({ google: false }))
    expect(wrapper.find('a[href="/admin/reset-password"]').exists()).toBe(true)
  })
})
