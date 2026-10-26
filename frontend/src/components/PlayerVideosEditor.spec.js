import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlayerVideosEditor from './PlayerVideosEditor.vue'

const EXISTING = { id: 5, title: 'ישן', url: 'https://youtu.be/dQw4w9WgXcQ' }
const mountEditor = () => mount(PlayerVideosEditor, { props: { player: { id: 3, videos: [EXISTING] } } })

async function fillAndAdd(wrapper) {
  await wrapper.find('#player-video-title').setValue('חדש')
  await wrapper.find('#player-video-url').setValue('https://youtu.be/aaaaaaaaaaa')
  await wrapper.find('[data-testid="add-video"]').trigger('click')
  await flushPromises()
}

describe('PlayerVideosEditor', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adds a video and emits the new list', async () => {
    const created = { id: 6, title: 'חדש', url: 'https://youtu.be/aaaaaaaaaaa' }
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 201, json: async () => created }))
    const wrapper = mountEditor()
    await fillAndAdd(wrapper)

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/players/3/videos')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ title: 'חדש', url: 'https://youtu.be/aaaaaaaaaaa' })
    expect(wrapper.emitted('change')[0][0]).toEqual([EXISTING, created])
  })

  it('removes a video and emits the filtered list', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 204, json: async () => null }))
    const wrapper = mountEditor()
    await wrapper.find('[data-testid="remove-video"]').trigger('click')
    await flushPromises()

    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/players/3/videos/5')
    expect(init.method).toBe('DELETE')
    expect(wrapper.emitted('change')[0][0]).toEqual([])
  })

  it('shows the server message on 409 (video cap)', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 409, json: async () => ({ detail: 'עד 20' }) }))
    const wrapper = mountEditor()
    await fillAndAdd(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('עד 20')
    expect(wrapper.emitted('change')).toBeUndefined()
  })

  it('shows the YouTube-only error on 422 and emits nothing', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 422, json: async () => ({}) }))
    const wrapper = mountEditor()
    await fillAndAdd(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('קישור יוטיוב לא תקין')
    expect(wrapper.emitted('change')).toBeUndefined()
  })
})
