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

  it('a logged-in non-admin visiting /admin is sent to join', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ username: 'p', is_admin: false, team_ids: [] }),
    })

    const { default: router } = await import('./index.js')

    router.push('/admin')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('join')
  })

  it('/account resolves to the account page, not a team slug, and needs a login', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })
    const { default: router } = await import('./index.js')

    expect(router.resolve('/account').name).toBe('account')
    await router.push('/account')

    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('/join logged out goes to admin-login', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })
    const { default: router } = await import('./index.js')

    await router.push('/join')

    expect(router.currentRoute.value.name).toBe('admin-login')
  })

  it('/join for a logged-in non-admin stays on join', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ username: 'p', is_admin: false }) })
    const { default: router } = await import('./index.js')

    await router.push('/join')

    expect(router.currentRoute.value.name).toBe('join')
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
    expect(router.resolve('/teams').name).toBe('teams')
    const league = router.resolve('/teams/123')
    expect([league.name, league.params.leagueId]).toEqual(['league-teams', '123'])
    expect(router.resolve('/admin/teams/batch').name).toBe('admin-teams-batch-edit')
  })

  it('bare / with nothing remembered goes to /teams', async () => {
    const { default: router } = await import('./index.js')
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('teams')
  })

  it('bare / with a remembered team stays on home', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '2')
    const { default: router } = await import('./index.js')
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('legacy bare /schedule with nothing remembered goes to /teams and persists no team', async () => {
    const { default: router } = await import('./index.js')
    await router.push('/schedule')
    expect(router.currentRoute.value.name).toBe('teams')
    expect(localStorage.getItem('gush-ball:selected-team-id')).toBeNull()
  })

  it('legacy bare /stats?game=5 redirects to the remembered team, keeping the page and query', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '2')
    const { default: router } = await import('./index.js')

    await router.push('/stats?game=5')

    expect(router.currentRoute.value.path).toBe('/2/stats')
    expect(router.currentRoute.value.query.game).toBe('5')
  })

  it("a team admin visiting bare /admin is sent to their team's admin home", async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, team_id: 2, is_admin: true }) })
    const { default: router } = await import('./index.js')

    await router.push('/admin')

    expect(router.currentRoute.value.name).toBe('team-admin-home')
    expect(router.currentRoute.value.params.slug).toBe('2')
  })

  it('a full admin visiting bare /admin stays on admin-home', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, team_id: null, is_admin: true }) })
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
    expect(document.title).toBe('ניהול · GushBall')
  })

  it('every public route except not-found/login/reset has a description; not-found is noindex', async () => {
    const { default: router } = await import('./index.js')

    // club: ClubView sets its own title/description/JSON-LD
    const skip = ['not-found', 'admin-login', 'admin-reset-password', 'admin-signup', 'admin-verify-email', 'join', 'account', 'club']
    const publicRoutes = router.getRoutes().filter((r) => !r.meta.requiresAuth && !r.redirect && !skip.includes(r.name))
    expect(publicRoutes.length).toBeGreaterThan(0)
    for (const r of publicRoutes) {
      expect(typeof r.meta.description, r.name).toBe('function')
      // player pages and the teams index are not about the remembered team, so no team name there
      if (!['player', 'teams', 'league-teams'].includes(r.name)) expect(r.meta.description('קבוצה'), r.name).toContain('קבוצה')
    }
    expect(router.getRoutes().find((r) => r.name === 'not-found').meta.noindex).toBe(true)
    expect(router.getRoutes().find((r) => r.name === 'stats').meta.noindex).toBe(true)
  })

  it('resolves the public game route', async () => {
    const { default: router } = await import('./index.js')
    expect(router.resolve({ name: 'game', params: { slug: 'x', id: 5 } }).path).toBe('/x/games/5')
  })

  it('redirects the old /:slug/club URL to the team home', async () => {
    global.fetch.mockResolvedValue({ ok: false })
    const { default: router } = await import('./index.js')

    await router.push('/team_a/club')

    expect(router.currentRoute.value.name).toBe('team-home')
    expect(router.currentRoute.value.params.slug).toBe('team_a')
  })

  describe('on a club host (#485)', () => {
    const setClubHost = () => {
      const meta = document.createElement('meta')
      meta.name = 'club-domains'
      meta.content = JSON.stringify({ 7: location.origin })
      document.head.append(meta)
    }
    afterEach(() => {
      document.head.querySelectorAll('meta[name="club-domains"]').forEach((el) => el.remove())
      vi.doUnmock('../lib/site.js')
    })

    it('/ resolves to the club page, not /teams', async () => {
      setClubHost()
      const { default: router } = await import('./index.js')

      router.push('/')
      await router.isReady()

      expect(router.currentRoute.value.name).toBe('club-home')
    })

    it('account routes leave for the main site', async () => {
      setClubHost()
      const toMainSite = vi.fn()
      vi.doMock('../lib/site.js', async (importOriginal) => ({ ...(await importOriginal()), toMainSite }))
      const { default: router } = await import('./index.js')
      await router.push('/')

      for (const path of ['/admin/login', '/join', '/team_a/stats']) {
        await router.push(path)
        expect(toMainSite).toHaveBeenLastCalledWith(path)
        expect(router.currentRoute.value.name).toBe('club-home')
      }
    })
  })
})
