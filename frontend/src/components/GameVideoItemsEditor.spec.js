import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ITEMS = [
  { title: 'א', text: 'טקסט א', urls: ['https://youtu.be/a'] },
  { title: 'ב', text: null, urls: [] },
  { title: 'ג', text: null, urls: ['https://youtu.be/c', 'https://youtu.be/d'] },
]
const putCall = () => global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')

async function mountEditor(put, props = {}) {
  global.fetch = vi.fn(() => Promise.resolve(put))
  const { default: Editor } = await import('./GameVideoItemsEditor.vue')
  return mount(Editor, { props: { teamId: 1, gameId: 5, items: ITEMS, field: 'briefing', ...props } })
}

describe('GameVideoItemsEditor', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['briefing', 'אין פריטים בתדריך', 'שמירת תדריך', 'שגיאה בשמירת התדריך, נסו שוב'],
    ['highlights', 'אין היילייטס', 'שמירת היילייטס', 'שגיאה בשמירת ההיילייטס, נסו שוב'],
  ])('names its own list (%s) in the empty state, save button and error', async (field, empty, save, error) => {
    const wrapper = await mountEditor({ ok: false, status: 500, json: async () => ({}) }, { field, items: [] })
    expect(wrapper.text()).toContain(empty)
    expect(wrapper.find('button[type="submit"]').text()).toBe(save)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe(error)
  })

  it('moves, removes and saves the list as PUT body', async () => {
    const response = [{ title: 'ב', text: null, urls: [] }, { title: 'א', text: 'טקסט א', urls: ['https://youtu.be/a'] }]
    const wrapper = await mountEditor({ ok: true, status: 200, json: async () => response })
    await wrapper.find('[aria-label="הזזה למטה 1"]').trigger('click')
    await wrapper.find('[aria-label="הסרת פריט 3"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(putCall()[0]).toBe('/api/teams/1/games/5/briefing')
    expect(JSON.parse(putCall()[1].body)).toEqual(response)
    expect(wrapper.emitted('saved')[0][0]).toEqual(response)
  })

  it('adds and removes video rows per item and drops blanks', async () => {
    const wrapper = await mountEditor({ ok: true, status: 200, json: async () => [] })
    await wrapper.find('[data-test="add-video-0"]').trigger('click')
    await wrapper.find('#briefing-url-0-1').setValue('https://youtu.be/b')
    await wrapper.find('[data-test="add-video-1"]').trigger('click') // left blank
    await wrapper.find('[aria-label="הסרת סרטון 1 מפריט 3"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(putCall()[1].body).map((i) => i.urls)).toEqual([
      ['https://youtu.be/a', 'https://youtu.be/b'],
      [],
      ['https://youtu.be/d'],
    ])
  })

  it('shows a 422 message and keeps the form', async () => {
    const wrapper = await mountEditor({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'bad' }] }) })
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).not.toBe('')
    expect(wrapper.findAll('input').length).toBeGreaterThan(0)
  })

  it('saves highlights to their own endpoint with field-prefixed ids', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => [] }))
    const { default: Editor } = await import('./GameVideoItemsEditor.vue')
    const wrapper = mount(Editor, { props: { teamId: 1, gameId: 5, items: ITEMS, field: 'highlights' } })
    expect(wrapper.find('#highlights-url-0-0').exists()).toBe(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(putCall()[0]).toBe('/api/teams/1/games/5/highlights')
  })
})
