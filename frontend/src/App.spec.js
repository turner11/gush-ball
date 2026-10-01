import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import router from './router'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the nav shell', async () => {
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('לוח משחקים')
    expect(wrapper.find('img[alt="גוש כדורסל"]').exists()).toBe(true)
  })

  it('renders the admin layout exactly once on an authenticated admin page', async () => {
    global.fetch = vi.fn((url) =>
      Promise.resolve({ ok: true, json: async () => (url === '/api/teams' ? [] : { username: 'admin' }) }),
    )

    await router.push('/admin')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('admin-home')
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.text()).toContain('אזור ניהול')
  })
})
