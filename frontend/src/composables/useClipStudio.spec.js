import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '../lib/api'
import { useClipStudio } from './useClipStudio'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

const studio = () => useClipStudio(ref(1), ref(5))
const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}
const calls = (method) => apiFetch.mock.calls.filter((c) => c[1]?.method === method)

describe('useClipStudio', () => {
  beforeEach(() => apiFetch.mockReset())

  it('a change during an in-flight POST gives one POST then one PATCH with the latest state', async () => {
    const post = deferred()
    apiFetch.mockImplementation((path, opts) => (opts?.method === 'POST' ? post.promise : Promise.resolve({})))
    const s = studio()
    const clip = s.add({ source_url: 'https://youtu.be/aaaaaaaaaaa', start: 1, end: 5 })
    s.change(clip, { start: 2 })
    s.change(clip, { start: 3 })
    expect(calls('POST')).toHaveLength(1)
    post.resolve({ id: 42 })
    await vi.waitFor(() => expect(clip.status).toBe('saved'))
    expect(calls('PATCH')).toHaveLength(1)
    expect(calls('PATCH')[0][0]).toBe('/teams/1/clips/42')
    expect(calls('PATCH')[0][1].body.start).toBe(3)
  })

  it('a failed save marks the clip and the next change retries', async () => {
    apiFetch.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 422 }))
    const s = studio()
    const clip = s.add({ start: 1, end: 5 })
    await vi.waitFor(() => expect(clip.status).toBe('error'))
    expect(clip.error).toBe('ערך לא תקין')
    apiFetch.mockResolvedValue({ id: 7 })
    await s.change(clip, { section: 'x' })
    expect(clip.status).toBe('saved')
    expect(clip.id).toBe(7)
    expect(calls('POST')).toHaveLength(2)
  })

  it('delete then undo re-creates the clip with a POST', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const s = studio()
    const clip = s.add({ start: 1, end: 5, section: 'x', is_highlight: true })
    await vi.waitFor(() => expect(clip.id).toBe(1))
    apiFetch.mockResolvedValue(null)
    await s.remove(clip)
    expect(calls('DELETE')[0][0]).toBe('/teams/1/clips/1')
    expect(s.clips.value).toEqual([])
    apiFetch.mockResolvedValue({ id: 2 })
    s.undo()
    expect(s.clips.value).toHaveLength(1)
    expect(calls('POST')[1][1].body).toMatchObject({ section: 'x', is_highlight: true, start: 1, game_id: 5 })
    expect(s.lastDeleted.value).toBeNull()
  })

  it('a failed delete puts the clip back with an error', async () => {
    apiFetch.mockResolvedValue({ id: 1 })
    const s = studio()
    const clip = s.add({ start: 1, end: 5 })
    await vi.waitFor(() => expect(clip.id).toBe(1))
    apiFetch.mockRejectedValueOnce({ status: 500 })
    await s.remove(clip)
    expect(s.clips.value).toHaveLength(1)
    expect(clip.status).toBe('error')
  })

  it('load lists this game newest first and suggests sections of every clip', async () => {
    const row = (id, game_id, section) => ({ id, team_id: 1, game_id, section, player_ids: [] })
    apiFetch.mockResolvedValue([row(1, 5, 'b'), row(2, 9, 'a'), row(3, 5, null)])
    const s = studio()
    await s.load()
    expect(s.clips.value.map((c) => c.id)).toEqual([3, 1])
    expect(s.sections.value).toEqual(['a', 'b'])
  })
})
