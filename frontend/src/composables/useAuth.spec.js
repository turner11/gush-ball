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
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })

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

  it('ownTeams filters by team_ids and fullAdmin is true only when team_ids is null', async () => {
    const { useAuth, ownTeams, fullAdmin } = await import('./useAuth.js')
    const { user } = useAuth()
    const teams = [{ id: 1 }, { id: 2 }, { id: 3 }]

    user.value = { username: 'a', team_ids: null }
    expect(ownTeams(teams)).toHaveLength(3)
    expect(fullAdmin.value).toBe(true)

    user.value = { username: 'c', team_ids: [1, 3] }
    expect(ownTeams(teams).map((t) => t.id)).toEqual([1, 3])
    expect(fullAdmin.value).toBe(false)

    user.value = { username: 'empty', team_ids: [] }
    expect(ownTeams(teams)).toEqual([])
  })

  it("ownTeams puts the user's teams first, then sorts by name", async () => {
    const { useAuth, ownTeams } = await import('./useAuth.js')
    const { user } = useAuth()
    user.value = {
      username: 'a',
      team_ids: null,
      memberships: [
        { team_id: 3, role: 'member' },
        { team_id: 1, role: 'admin' },
        { team_id: 4, role: 'pending' },
      ],
    }
    const teams = [
      { id: 4, name: 'א' },
      { id: 3, name: 'ת' },
      { id: 2, name: 'ב' },
      { id: 1, name: 'ש', club: 'X' },
      { id: 5, name: 'ג' },
    ]
    const copy = [...teams]

    expect(ownTeams(teams).map((t) => t.id)).toEqual([3, 1, 4, 2, 5])
    expect(teams).toEqual(copy)
  })

  it("ownTeams puts member teams before favourites", async () => {
    const { useAuth, ownTeams } = await import('./useAuth.js')
    const { user } = useAuth()
    user.value = { username: 'a', team_ids: null, memberships: [{ team_id: 3, role: 'member' }], favorite_team_ids: [5] }
    const teams = [{ id: 2, name: 'ב' }, { id: 3, name: 'ת' }, { id: 5, name: 'ש' }]
    expect(ownTeams(teams).map((t) => t.id)).toEqual([3, 5, 2])
  })

  it('clubAdmin is true only for a club the user admins', async () => {
    const { useAuth, clubAdmin } = await import('./useAuth.js')
    const { user } = useAuth()

    user.value = { username: 'c', team_ids: [1], clubs: ['Gush'] }
    expect(clubAdmin('Gush')).toBe(true)
    expect(clubAdmin('Other')).toBe(false)
    expect(clubAdmin(null)).toBe(false)

    user.value = { username: 't', team_ids: [1] }
    expect(clubAdmin('Gush')).toBe(false)
  })

  it('safeNext keeps internal paths and drops anything that can leave the site', async () => {
    const { safeNext } = await import('./useAuth')
    expect(safeNext('/teams/10?x=1')).toBe('/teams/10?x=1')
    for (const bad of ['/\t/evil.com', '/\n/evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', null]) {
      expect(safeNext(bad)).toBeNull()
    }
  })

  it('teamMember: false when anonymous or the field is missing, true for null, matches string ids', async () => {
    const { useAuth, teamMember } = await import('./useAuth.js')
    const { user } = useAuth()

    expect(teamMember('1')).toBe(false)
    user.value = { username: 'a' }
    expect(teamMember('1')).toBe(false)
    user.value = { username: 'a', member_team_ids: [1, 3] }
    expect(teamMember('1')).toBe(true)
    expect(teamMember('2')).toBe(false)
    user.value = { username: 'a', member_team_ids: null }
    expect(teamMember('2')).toBe(true)
  })

  it('canEditTeam follows teamAdmin and is false while viewing as member', async () => {
    const { canEditTeam, teamAdmin, viewAsMember, useAuth } = await import('./useAuth.js')
    const { user } = useAuth()

    expect(canEditTeam(1)).toBe(false)
    user.value = { username: 'a', team_ids: [1] }
    expect(canEditTeam(1)).toBe(true)
    expect(canEditTeam(2)).toBe(false)
    viewAsMember.value = true
    expect(canEditTeam(1)).toBe(false)
    expect(teamAdmin(1)).toBe(true)
  })
})
