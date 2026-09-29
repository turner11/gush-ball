import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stub = { template: '<div/>' }

async function mountAt(path) {
  vi.resetModules()
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin', name: 'admin-home', component: stub },
      { path: '/admin/players', component: stub },
      { path: '/admin/games', component: stub },
      { path: '/admin/standings', component: stub },
      { path: '/admin/teams', name: 'admin-teams', component: stub },
      { path: '/admin/login', name: 'admin-login', component: stub },
    ],
  })
  router.push(path)
  await router.isReady()
  const { default: AdminLayout } = await import('./AdminLayout.vue')
  const wrapper = mount(AdminLayout, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const link = (w, href) => w.find(`nav a[href="${href}"]`)

describe('AdminLayout nav', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.reject(new Error('no fetch')))
  })

  it('renders links to every admin section', async () => {
    const w = await mountAt('/admin')
    for (const h of ['/admin', '/admin/players', '/admin/games', '/admin/standings', '/admin/teams']) {
      expect(link(w, h).exists(), h).toBe(true)
    }
  })

  it('marks the current section link active', async () => {
    const w = await mountAt('/admin/games')
    expect(link(w, '/admin/games').classes()).toContain('font-bold')
    expect(link(w, '/admin/players').classes()).not.toContain('font-bold')
  })

  it('does not mark the home link active on a sub-page', async () => {
    const w = await mountAt('/admin/players')
    expect(link(w, '/admin').classes()).not.toContain('font-bold')
  })
})
