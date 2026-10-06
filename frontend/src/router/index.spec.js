import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('router auth guard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects to admin-login when visiting /admin without a session', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })

    const { default: router } = await import('./index.js')

    router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('redirects to admin-login when visiting /admin/teams without a session', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })

    const { default: router } = await import('./index.js')

    router.push('/admin/teams')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('redirects to admin-login when visiting /admin/teams/1 without a session', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })

    const { default: router } = await import('./index.js')

    router.push('/admin/teams/1')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('/admin/reset-password is public: resolves by name and is not redirected to login', async () => {
    const { default: router } = await import('./index.js')

    expect(router.resolve('/admin/reset-password').name).toBe('admin-reset-password')
    await router.push('/admin/reset-password')
    expect(router.currentRoute.value.name).toBe('admin-reset-password')
  })

  it('team pages and team admin resolve under /:slug', async () => {
    const { default: router } = await import('./index.js')

    expect(router.resolve('/elizur').name).toBe('team-home')
    for (const page of ['schedule', 'standings', 'roster', 'media', 'stats']) {
      const r = router.resolve(`/elizur/${page}`)
      expect([r.name, r.params.slug], page).toEqual([page, 'elizur'])
    }
    expect(router.resolve('/elizur/admin').name).toBe('team-admin-home')
    expect(router.resolve('/elizur/admin/players').name).toBe('admin-players')
    expect(router.resolve('/elizur/admin/games').name).toBe('admin-games')
    expect(router.resolve('/admin').name).toBe('admin-home')
    expect(router.resolve('/admin/standings').name).toBe('admin-standings')
    expect(router.resolve('/admin/teams').name).toBe('admin-teams')
  })

  it('legacy bare /stats?game=5 redirects to the remembered team, keeping the page and query', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '2')
    const { default: router } = await import('./index.js')

    await router.push('/stats?game=5')

    expect(router.currentRoute.value.path).toBe('/2/stats')
    expect(router.currentRoute.value.query.game).toBe('5')
  })

  it("a team admin visiting bare /admin is sent to their team's admin home", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, team_id: 2 }) })
    const { default: router } = await import('./index.js')

    await router.push('/admin')

    expect(router.currentRoute.value.name).toBe('team-admin-home')
    expect(router.currentRoute.value.params.slug).toBe('2')
  })

  it('a full admin visiting bare /admin stays on admin-home', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, team_id: null }) })
    const { default: router } = await import('./index.js')

    await router.push('/admin')

    expect(router.currentRoute.value.name).toBe('admin-home')
  })

  it('afterEach leaves the title alone on public routes, sets it on admin routes', async () => {
    document.title = 'קבוצה'
    const { default: router } = await import('./index.js')

    await router.push('/elizur/schedule')
    await router.push('/elizur/schedule') // duplicate navigation still fires afterEach
    expect(document.title).toBe('קבוצה')

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, is_admin: true }) })
    await router.push('/admin')
    expect(document.title).toBe('ניהול · גוש כדורסל')
  })

  it('every public route except not-found/login/reset has a description; not-found is noindex', async () => {
    const { default: router } = await import('./index.js')

    const skip = ['not-found', 'admin-login', 'admin-reset-password']
    const publicRoutes = router.getRoutes().filter((r) => !r.meta.requiresAuth && !r.redirect && !skip.includes(r.name))
    expect(publicRoutes.length).toBeGreaterThan(0)
    for (const r of publicRoutes) {
      expect(typeof r.meta.description, r.name).toBe('function')
      // player pages belong to the player's team, not the remembered one, so no team name there
      if (r.name !== 'player') expect(r.meta.description('קבוצה'), r.name).toContain('קבוצה')
    }
    expect(router.getRoutes().find((r) => r.name === 'not-found').meta.noindex).toBe(true)
  })
})
