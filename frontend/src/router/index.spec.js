import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('router auth guard', () => {
  beforeEach(() => {
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

  it('/elizur resolves to team-home and /schedule stays schedule', async () => {
    const { default: router } = await import('./index.js')

    expect(router.resolve('/elizur').name).toBe('team-home')
    expect(router.resolve('/schedule').name).toBe('schedule')
  })

  it('/media resolves to media, not team-home', async () => {
    const { default: router } = await import('./index.js')

    expect(router.resolve('/media').name).toBe('media')
  })

  it('afterEach leaves the title alone on public routes, sets it on admin routes', async () => {
    document.title = '🏀קבוצה'
    const { default: router } = await import('./index.js')

    await router.push('/schedule')
    await router.push('/schedule') // duplicate navigation still fires afterEach
    expect(document.title).toBe('🏀קבוצה')

    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, is_admin: true }) })
    await router.push('/admin')
    expect(document.title).toBe('ניהול · גוש כדורסל')
  })
})
