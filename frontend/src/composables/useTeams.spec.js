import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTeams } from './useTeams.js'

describe('useTeams', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('get() fetches and returns a single team by id', async () => {
    const team = { id: 1, name: 'מכבי' }
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => team })

    const { get } = useTeams()
    const result = await get(1)

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1', { credentials: 'include' })
    expect(result).toEqual(team)
  })

  it('get() sets an error and returns nothing when the team is not found', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const teams = useTeams()
    const result = await teams.get(999)

    expect(result).toBeUndefined()
    expect(teams.error.value).toBeTruthy()
  })

  it('list() fetches and returns teams from /api/teams', async () => {
    const teams = [{ id: 1, name: 'מכבי' }]
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => teams })

    const { list } = useTeams()
    const result = await list()

    expect(global.fetch).toHaveBeenCalledWith('/api/teams', { credentials: 'include' })
    expect(result).toEqual(teams)
  })

  it('create() posts a new team and returns it', async () => {
    const created = { id: 2, name: 'הפועל' }
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => created })

    const { create } = useTeams()
    const result = await create({ name: 'הפועל' })

    expect(global.fetch).toHaveBeenCalledWith('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: 'הפועל' }),
    })
    expect(result).toEqual(created)
  })

  it('update() patches a team by id', async () => {
    const updated = { id: 1, name: 'מכבי', primary_color: '#ff0000' }
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => updated })

    const { update } = useTeams()
    const result = await update(1, { primary_color: '#ff0000' })

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ primary_color: '#ff0000' }),
    })
    expect(result).toEqual(updated)
  })

  it('delete() removes a team by id', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })

    const { delete: destroy } = useTeams()
    await destroy(1)

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  it.each([
    ['list', (teams) => teams.list()],
    ['create', (teams) => teams.create({ name: 'x' })],
    ['update', (teams) => teams.update(1, { name: 'x' })],
    ['delete', (teams) => teams.delete(1)],
  ])('%s sets an error instead of throwing when fetch rejects', async (_, call) => {
    global.fetch.mockRejectedValueOnce(new TypeError('network down'))

    const teams = useTeams()

    await call(teams)

    expect(teams.error.value).toBeTruthy()
  })

  it.each([
    ['list', (teams) => teams.list()],
    ['create', (teams) => teams.create({ name: 'x' })],
    ['update', (teams) => teams.update(1, { name: 'x' })],
    ['delete', (teams) => teams.delete(1)],
  ])('%s sets an error instead of returning data when the response is not ok', async (_, call) => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) })

    const teams = useTeams()
    const result = await call(teams)

    expect(teams.error.value).toBeTruthy()
    expect(result).toBeUndefined()
  })
})
