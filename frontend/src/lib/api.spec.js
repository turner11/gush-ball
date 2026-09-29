import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('apiFetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves parsed JSON on a 2xx response and sends credentials: include', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, name: 'טים' }),
    })

    const { apiFetch } = await import('./api.js')
    const result = await apiFetch('/teams/1')

    expect(result).toEqual({ id: 1, name: 'טים' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('passes FormData through without JSON-stringifying or setting Content-Type', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: 'x' }) })
    const fd = new FormData()
    fd.append('file', new File(['a'], 'a.png', { type: 'image/png' }))

    const { apiFetch } = await import('./api.js')
    await apiFetch('/uploads', { method: 'POST', body: fd })

    const init = global.fetch.mock.calls[0][1]
    expect(init.body).toBe(fd)
    expect(init.headers?.['Content-Type']).toBeUndefined()
  })

  it('sends a JSON body and Content-Type header for a plain-object body', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ id: 2 }) })

    const { apiFetch } = await import('./api.js')
    await apiFetch('/teams/1/players', { method: 'POST', body: { name: 'שחקן' } })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/players',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'שחקן' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('returns null on a 204 response without calling .json()', async () => {
    const json = vi.fn()
    global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json })

    const { apiFetch } = await import('./api.js')
    const result = await apiFetch('/teams/1/players/2', { method: 'DELETE' })

    expect(result).toBe(null)
    expect(json).not.toHaveBeenCalled()
  })

  it('throws an Error using the response body detail when res.ok is false', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Team not found' }),
    })

    const { apiFetch } = await import('./api.js')

    await expect(apiFetch('/teams/999')).rejects.toThrow('Team not found')
  })
})
