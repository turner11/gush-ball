import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTeamContent } from './useTeamContent.js'

describe('useTeamContent', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('list() fetches items for a given team+resource', async () => {
    const links = [{ id: 1, team_id: 5, label: 'אתר', url: 'https://example.com' }]
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => links })

    const { list } = useTeamContent('links')
    const result = await list(5)

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/5/links', { credentials: 'include' })
    expect(result).toEqual(links)
  })

  it('create() posts a new item scoped to team_id/resource', async () => {
    const created = { id: 2, team_id: 5, label: 'אתר', url: 'https://example.com' }
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => created })

    const { create } = useTeamContent('links')
    const result = await create(5, { label: 'אתר', url: 'https://example.com' })

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/5/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label: 'אתר', url: 'https://example.com' }),
    })
    expect(result).toEqual(created)
  })

  it('delete() removes an item', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true })

    const { delete: destroy } = useTeamContent('links')
    await destroy(5, 2)

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/5/links/2', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  it.each([
    ['list', (content) => content.list(5)],
    ['create', (content) => content.create(5, { label: 'x', url: 'https://example.com' })],
    ['delete', (content) => content.delete(5, 2)],
  ])('%s sets an error instead of throwing when fetch rejects', async (_, call) => {
    global.fetch.mockRejectedValueOnce(new TypeError('network down'))

    const content = useTeamContent('links')

    await call(content)

    expect(content.error.value).toBeTruthy()
  })
})
