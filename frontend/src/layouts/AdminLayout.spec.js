import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stub = { template: '<div/>' }

const TEAMS = [
  { id: 1, name: 'קבוצה א', name_en: 'Team A' },
  { id: 2, name: 'קבוצה ב', name_en: 'Team B' },
]

async function mountAt(path, user = null) {
  vi.resetModules()
  if (user) (await import('../composables/useAuth.js')).useAuth().user.value = user
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/admin', name: 'admin-home', component: stub },
      { path: '/admin/players', component: stub },
      { path: '/admin/games', component: stub },
      { path: '/:slug/admin', name: 'team-admin-home', component: stub },
      { path: '/:slug/admin/players', name: 'admin-players', component: stub },
      { path: '/:slug/admin/games', name: 'admin-games', component: stub },
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
    localStorage.clear()
    global.fetch = vi.fn((url) =>
      url === '/api/teams'
        ? Promise.resolve({ ok: true, status: 200, json: async () => TEAMS })
        : Promise.reject(new Error('no fetch')),
    )
  })

  it('renders links to every admin section', async () => {
    const w = await mountAt('/admin')
    for (const h of ['/admin', '/admin/players', '/admin/games', '/admin/standings', '/admin/teams']) {
      expect(link(w, h).exists(), h).toBe(true)
    }
  })

  it('marks the current section link active', async () => {
    const w = await mountAt('/team_a/admin/games')
    expect(link(w, '/team_a/admin/games').classes()).toContain('font-bold')
    expect(link(w, '/team_a/admin/players').classes()).not.toContain('font-bold')
  })

  it('does not mark the home link active on a sub-page', async () => {
    const w = await mountAt('/team_a/admin/players')
    expect(link(w, '/team_a/admin').classes()).not.toContain('font-bold')
  })

  it('renders a mobile tab bar with every admin section', async () => {
    const w = await mountAt('/admin')
    const hrefs = w
      .find('[data-testid="tab-bar"]')
      .findAll('a')
      .map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/admin', '/admin/players', '/admin/games', '/admin/standings', '/admin/teams'])
  })

  it('team admin also gets the standings link', async () => {
    const w = await mountAt('/admin', { team_id: 1 })
    expect(link(w, '/admin/standings').exists()).toBe(true)
    expect(w.find('[data-testid="tab-bar"]').find('a[href="/admin/standings"]').exists()).toBe(true)
  })

  it('on /team_b/admin/players the team links carry the slug', async () => {
    const w = await mountAt('/team_b/admin/players')
    for (const h of ['/team_b/admin', '/team_b/admin/players', '/team_b/admin/games', '/admin/standings', '/admin/teams']) {
      expect(link(w, h).exists(), h).toBe(true)
    }
  })

  it("a team admin on another team's slug is moved to their own team", async () => {
    const w = await mountAt('/team_a/admin/games', { team_id: 2 })
    expect(w.vm.$router.currentRoute.value.path).toBe('/team_b/admin/games')
  })
})
