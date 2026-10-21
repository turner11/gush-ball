import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const GAME = {
  id: 5,
  videos: [{ url: 'https://www.youtube.com/watch?v=abc', title: 'תקציר', title_en: null }],
  images: [{ url: 'https://cdn.example.com/a.jpg', title: null, title_en: null }],
}
const res = (body, status = 200) => ({ ok: true, status, json: async () => body })

function mockFetch({ put } = {}) {
  global.fetch = vi.fn((url, options = {}) => {
    if (options.method === 'PUT') return Promise.resolve(put ? put() : res({ videos: [], images: [] }))
    if (url === '/api/teams/1/games/5') return Promise.resolve(res(GAME))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

async function mountEditor() {
  const { default: Editor } = await import('./GameMediaEditor.vue')
  const wrapper = mount(Editor, { props: { teamId: 1, gameId: 5 } })
  await flushPromises()
  return wrapper
}

const putCall = () => global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')

describe('GameMediaEditor', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('prefills video and image rows from the game', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    expect(wrapper.find('#video-title-0').element.value).toBe('תקציר')
    expect(wrapper.find('#video-url-0').element.value).toBe('https://www.youtube.com/watch?v=abc')
    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/a.jpg')
  })

  it('adds a video row, PUTs it with null title_en, and emits saved', async () => {
    const saved = { videos: [], images: [] }
    mockFetch({ put: () => res(saved) })
    const wrapper = await mountEditor()
    await wrapper.find('[data-test=add-video]').trigger('click')
    await wrapper.find('#video-title-1').setValue('משחק מלא')
    await wrapper.find('#video-url-1').setValue('https://veo.co/m/1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(putCall()[0]).toBe('/api/teams/1/games/5/media')
    expect(JSON.parse(putCall()[1].body).videos[1]).toEqual({ url: 'https://veo.co/m/1', title: 'משחק מלא', title_en: null })
    expect(wrapper.emitted('saved')[0][0]).toEqual(saved)
    expect(wrapper.find('[aria-live=polite]').text()).toBe('המדיה נשמרה')
  })

  it('adds an uploaded image row and removes a row', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    const { default: ImageUpload } = await import('./ImageUpload.vue')
    wrapper.findComponent(ImageUpload).vm.$emit('uploaded', 'https://cdn.example.com/b.jpg')
    await flushPromises()
    expect(wrapper.findAll('img')).toHaveLength(2)

    await wrapper.find('[data-test=remove-image-0]').trigger('click')
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/b.jpg')
  })

  it('shows a Hebrew message, not [object Object], on a validation error', async () => {
    mockFetch({ put: () => ({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'bad url' }] }) }) })
    const wrapper = await mountEditor()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toBe('יש שדה לא תקין (קישור או אורך טקסט)')
  })
})
