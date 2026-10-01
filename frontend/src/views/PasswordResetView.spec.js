import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function mountReset(path, response) {
  global.fetch = vi.fn(() => Promise.resolve(response))
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/admin/reset-password', name: 'admin-reset-password', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const { default: PasswordResetView } = await import('./PasswordResetView.vue')
  return mount(PasswordResetView, { global: { plugins: [router] } })
}

const ok = { ok: true, status: 200, json: async () => ({ ok: true }) }

describe('PasswordResetView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('without a token, posts the email and shows the generic confirmation', async () => {
    const wrapper = await mountReset('/admin/reset-password', ok)
    await wrapper.find('input[type="email"]').setValue('a@b.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/auth/forgot-password')
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.com' })
    expect(wrapper.text()).toContain('אם הכתובת רשומה')
  })

  it('with a token, posts the new password and shows success', async () => {
    const wrapper = await mountReset('/admin/reset-password?token=abc', ok)
    await wrapper.find('input[type="password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/auth/reset-password')
    expect(JSON.parse(opts.body)).toEqual({ token: 'abc', password: 'newpassword1' })
    expect(wrapper.text()).toContain('הסיסמה עודכנה')
  })

  it('with a token and a 400, shows the invalid-link error', async () => {
    const wrapper = await mountReset('/admin/reset-password?token=abc', {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ detail: 'Invalid or expired link' }),
    })
    await wrapper.find('input[type="password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('הקישור אינו תקף')
  })
})
