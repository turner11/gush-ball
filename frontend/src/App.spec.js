import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { useAuth } from './composables/useAuth'
import { useSelectedTeam } from './composables/useSelectedTeam'
import router from './router'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the nav shell', async () => {
    useSelectedTeam().selectedTeamId.value = '1' // the nav only shows once a team is chosen
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })

    expect(wrapper.text()).toContain('לוח משחקים')
    expect(wrapper.find('img[alt="GushBall"]').exists()).toBe(true)
  })

  it('renders the admin layout exactly once on an authenticated admin page', async () => {
    global.fetch = vi.fn((url) =>
      Promise.resolve({ ok: true, json: async () => (['/api/teams', '/api/memberships'].includes(url) ? [] : { username: 'admin', is_admin: true }) }),
    )

    useAuth().checked.value = false // the first test's header check already marked the session as checked
    await router.push('/admin')
    const wrapper = mount(App, { global: { plugins: [router] } })
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('admin-home')
    expect(wrapper.findAll('header')).toHaveLength(1)
    expect(wrapper.findAll('main')).toHaveLength(1)
    expect(wrapper.text()).toContain('אזור ניהול')
  })
})
