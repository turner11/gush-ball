import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function mountSignup(response, path = '/admin/signup') {
  global.fetch = vi.fn(() => Promise.resolve(response))
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      { path: '/admin/signup', name: 'admin-signup', component: { template: '<div/>' } },
      { path: '/join', name: 'join', component: { template: '<div/>' } },
      { path: '/teams/:id', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const { default: SignupView } = await import('./SignupView.vue')
  return mount(SignupView, { global: { plugins: [router] } })
}

async function fill(wrapper, confirm = 'password123') {
  await wrapper.find('#username').setValue('dana')
  await wrapper.find('#email').setValue('d@x.com')
  await wrapper.find('#password').setValue('password123')
  await wrapper.find('#password-confirm').setValue(confirm)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

const ok = { ok: true, status: 200, json: async () => ({ username: 'dana', is_admin: false }) }
const fail = (status, detail) => ({ ok: false, status, statusText: 'x', json: async () => ({ detail }) })

describe('SignupView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('a password mismatch errors on the confirm field without calling the API', async () => {
    const wrapper = await mountSignup(ok)
    await fill(wrapper, 'different123')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(wrapper.find('#password-confirm-error').text()).toContain('הסיסמאות אינן תואמות')
  })

  it('posts username, email and password, then shows the verify notice with a link to join', async () => {
    const wrapper = await mountSignup(ok)
    await fill(wrapper)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/auth/signup')
    expect(JSON.parse(opts.body)).toEqual({ username: 'dana', email: 'd@x.com', password: 'password123' })
    expect(wrapper.find('[role="status"]').text()).toContain('d@x.com')
    expect(wrapper.find('a[href="/join"]').exists()).toBe(true)
  })

  it('the done link goes back to next when given', async () => {
    const wrapper = await mountSignup(ok, '/admin/signup?next=/teams/10')
    await fill(wrapper)
    const link = wrapper.find('a[href="/teams/10"]')
    expect(link.text()).toBe('המשך')
    expect(wrapper.find('a[href="/join"]').exists()).toBe(false)
  })

  it('409 shows the server message on the username field', async () => {
    const wrapper = await mountSignup(fail(409, 'שם המשתמש כבר קיים'))
    await fill(wrapper)
    expect(wrapper.find('#username-error').text()).toContain('שם המשתמש כבר קיים')
  })

  it('429 shows the rate-limit error', async () => {
    const wrapper = await mountSignup(fail(429, 'Too many'))
    await fill(wrapper)
    expect(wrapper.find('[role="alert"]').text()).toContain('יותר מדי ניסיונות')
  })

  it('503 says password signup is unavailable instead of try again', async () => {
    const wrapper = await mountSignup(fail(503, 'שליחת אימייל אינה מוגדרת'))
    await fill(wrapper)
    const text = wrapper.find('[role="alert"]').text()
    expect(text).toContain('אינה זמינה')
    expect(text).not.toContain('נסו שוב')
  })
})
