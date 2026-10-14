import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function mountVerify(path, response) {
  global.fetch = vi.fn(() => Promise.resolve(response))
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/admin/verify-email', name: 'admin-verify-email', component: { template: '<div/>' } },
      { path: '/join', name: 'join', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const { default: VerifyEmailView } = await import('./VerifyEmailView.vue')
  return mount(VerifyEmailView, { global: { plugins: [router] } })
}

const ok = { ok: true, status: 200, json: async () => ({ ok: true }) }
const fail = (status) => ({ ok: false, status, statusText: 'x', json: async () => ({}) })

describe('VerifyEmailView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('does not post until the button is clicked, then posts the token and shows success', async () => {
    const wrapper = await mountVerify('/admin/verify-email?token=abc', ok)
    expect(global.fetch).not.toHaveBeenCalled()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/auth/verify-email')
    expect(JSON.parse(opts.body)).toEqual({ token: 'abc' })
    expect(wrapper.text()).toContain('אומתה')
  })

  it('400 shows the invalid-link error and 409 the email-in-use error', async () => {
    let wrapper = await mountVerify('/admin/verify-email?token=abc', fail(400))
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('הקישור אינו תקף')
    vi.resetModules()
    wrapper = await mountVerify('/admin/verify-email?token=abc', fail(409))
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('כבר משויכת')
  })

  it('401 and 403 ask to sign in and link back to this page', async () => {
    for (const status of [401, 403]) {
      vi.resetModules()
      const wrapper = await mountVerify('/admin/verify-email?token=abc', fail(status))
      await wrapper.find('button').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').text()).toContain('התחברו לחשבון')
      const href = wrapper.find('a').attributes('href')
      expect(href).toContain('next=' + encodeURIComponent('/admin/verify-email?token=abc'))
    }
  })

  it('a missing token goes straight to the invalid-link state', async () => {
    const wrapper = await mountVerify('/admin/verify-email', ok)
    expect(wrapper.find('[role="alert"]').text()).toContain('הקישור אינו תקף')
  })
})
