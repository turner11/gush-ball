import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ITEMS = [
  { title: 'א', text: 'טקסט א', url: 'https://youtu.be/a' },
  { title: 'ב', text: null, url: null },
  { title: 'ג', text: null, url: null },
]
const putCall = () => global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')

async function mountEditor(put) {
  global.fetch = vi.fn(() => Promise.resolve(put))
  const { default: Editor } = await import('./GameBriefingEditor.vue')
  return mount(Editor, { props: { teamId: 1, gameId: 5, items: ITEMS } })
}

describe('GameBriefingEditor', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('moves, removes and saves the list as PUT body', async () => {
    const response = [{ title: 'ב', text: null, url: null }, { title: 'א', text: 'טקסט א', url: 'https://youtu.be/a' }]
    const wrapper = await mountEditor({ ok: true, status: 200, json: async () => response })
    await wrapper.find('[aria-label="הזזה למטה 1"]').trigger('click')
    await wrapper.find('[aria-label="הסרת פריט 3"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(putCall()[0]).toBe('/api/teams/1/games/5/briefing')
    expect(JSON.parse(putCall()[1].body)).toEqual(response)
    expect(wrapper.emitted('saved')[0][0]).toEqual(response)
  })

  it('shows a 422 message and keeps the form', async () => {
    const wrapper = await mountEditor({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'bad' }] }) })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).not.toBe('')
    expect(wrapper.findAll('input').length).toBeGreaterThan(0)
  })
})
