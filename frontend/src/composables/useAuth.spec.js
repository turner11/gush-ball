import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('login success stores the returned user and clears error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ username: 'admin' }),
    })

    const { useAuth } = await import('./useAuth.js')
    const { user, error, login } = useAuth()

    await login('admin', 'secret')

    expect(user.value).toEqual({ username: 'admin' })
    expect(error.value).toBe(null)
  })

  it('login failure sets an error and leaves user unset', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false })

    const { useAuth } = await import('./useAuth.js')
    const { user, error, login } = useAuth()

    await login('admin', 'wrong')

    expect(user.value).toBe(null)
    expect(error.value).toBeTruthy()
  })

  it('logout clears the current user', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })

    const { useAuth } = await import('./useAuth.js')
    const { user, logout } = useAuth()

    user.value = { username: 'admin' }

    await logout()

    expect(user.value).toBe(null)
  })

  it.each([
    ['login', (auth) => auth.login('admin', 'secret')],
    ['logout', (auth) => auth.logout()],
    ['checkSession', (auth) => auth.checkSession()],
  ])('%s sets an error instead of throwing when fetch rejects', async (_, call) => {
    global.fetch.mockRejectedValueOnce(new TypeError('network down'))

    const { useAuth } = await import('./useAuth.js')
    const auth = useAuth()

    await call(auth)

    expect(auth.error.value).toBeTruthy()
  })
})
