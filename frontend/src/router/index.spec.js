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
})
