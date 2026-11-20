import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const A = 'https://youtu.be/abcdefghijk'
const B = 'https://youtu.be/lmnopqrstuv'
const putCall = () => global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')

async function mountEditor(put, urls = [A]) {
  global.fetch = vi.fn(() => Promise.resolve(put))
  const { default: Editor } = await import('./GameVideoUrlsEditor.vue')
  return mount(Editor, { props: { endpoint: '/teams/1/games/5/video-urls', urls } })
}

describe('GameVideoUrlsEditor', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('adds, removes and saves trimmed URLs as the PUT body', async () => {
    const wrapper = await mountEditor({ ok: true, status: 200, json: async () => [B] }, [A, B])
    await wrapper.find('[data-test="add-video"]').trigger('click') // left blank
    await wrapper.find('[aria-label="הסרת סרטון 1"]').trigger('click')
    await wrapper.find('#footage-url-0').setValue(`  ${B}  `)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(putCall()[0]).toBe('/api/teams/1/games/5/video-urls')
    expect(JSON.parse(putCall()[1].body)).toEqual([B])
    expect(wrapper.emitted('saved')[0][0]).toEqual([B])
  })

  it('hides the add button at 10 URLs', async () => {
    const wrapper = await mountEditor({ ok: true, status: 200, json: async () => [] }, Array(10).fill(A))
    expect(wrapper.find('[data-test="add-video"]').exists()).toBe(false)
  })

  it('shows the 422 message and keeps the editor input', async () => {
    const wrapper = await mountEditor({ ok: false, status: 422, statusText: 'x', json: async () => ({}) })
    await wrapper.find('#footage-url-0').setValue('https://vimeo.com/1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('יש קישור לא תקין (רק סרטוני YouTube)')
    expect(wrapper.get('#footage-url-0').element.value).toBe('https://vimeo.com/1')
  })
})
