import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LINKS = [{ id: 10, label: 'אתר הבית', label_en: null, url: 'https://example.com' }]

// The ConfirmDialog's buttons render through an AlertDialog portal teleported to
// document.body, outside the mounted wrapper's own DOM subtree.
function body() {
  return new DOMWrapper(document.body)
}

const FIELDS = [
  { key: 'label', label: 'תווית', type: 'text', required: true },
  { key: 'label_en', label: 'תווית (אנגלית)', type: 'text' },
  { key: 'url', label: 'כתובת', type: 'url', required: true },
]

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const method = options.method || 'GET'
    const key = `${method} ${url}`
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}

function jsonRes(body, status = 200) {
  return { ok: true, status, json: async () => body }
}

describe('TeamContentSection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('field with upload:true fills the url input after an upload', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes([]),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/x.png' }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = FIELDS.map((f) => (f.key === 'url' ? { ...f, upload: true } : f))
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'links', heading: 'קישורים', fields },
    })
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['a'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('#links-url').element.value).toBe('https://cdn/x.png')
  })

  it('field with preview:true shows a list thumbnail and a form preview, so tags can be picked by sight', async () => {
    mockFetch({
      'GET /api/teams/1/images': () => jsonRes([{ id: 5, title: 'משחק', url: 'https://cdn/old.png' }]),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/new.png' }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'url', label: 'כתובת', type: 'url', required: true, upload: true, preview: true },
    ]
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'images', heading: 'תמונות', fields },
    })
    await flushPromises()

    expect(wrapper.find('li img').attributes('src')).toBe('https://cdn/old.png')
    expect(wrapper.find('form img').exists()).toBe(false)

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['a'], 'a.png', { type: 'image/png' })], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('form img').attributes('src')).toBe('https://cdn/new.png')
  })

  it('clicking מחיקה opens a confirmation dialog and does not call DELETE until confirmed', async () => {
    mockFetch({ 'GET /api/teams/1/links': () => jsonRes(LINKS) })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    expect(wrapper.text()).toContain('אתר הבית')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('confirming the dialog calls DELETE /api/teams/:id/:resource/:itemId and removes it from the list', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'DELETE /api/teams/1/links/10': () => jsonRes({}),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const confirmButton = body().findAll('button').find((b) => b.text() === 'אישור')
    await confirmButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.text()).not.toContain('אתר הבית')
  })

  it('a failed DELETE keeps the item in the list', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'DELETE /api/teams/1/links/10': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'מחיקה').trigger('click')
    await body().findAll('button').find((b) => b.text() === 'אישור').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('אתר הבית')
  })

  it('cancelling the dialog leaves the item in the list and issues no DELETE request', async () => {
    mockFetch({ 'GET /api/teams/1/links': () => jsonRes(LINKS) })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const cancelButton = body().findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('אתר הבית')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('players field sends an empty array and survives the payload filter', async () => {
    mockFetch({
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/players': () => jsonRes([]),
      'POST /api/teams/1/images': () => jsonRes({ id: 1, title: 't', player_ids: [] }, 201),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text' },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
    ]
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'images', heading: 'תמונות', fields },
    })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ player_ids: [] })
  })

  describe('reorderable', () => {
    const PLAYS = [
      { id: 5, title: 'ראשון' },
      { id: 6, title: 'שני' },
    ]
    const PLAY_FIELDS = [{ key: 'title', label: 'כותרת', type: 'text', required: true }]
    const mountPlays = async (extra) => {
      const { default: TeamContentSection } = await import('./TeamContentSection.vue')
      const wrapper = mount(TeamContentSection, {
        props: { teamId: 1, resource: 'plays', heading: 'פלייבוק', fields: PLAY_FIELDS, ...extra },
      })
      await flushPromises()
      return wrapper
    }

    it('moving the first row down PUTs the swapped ids and reorders the list', async () => {
      mockFetch({
        'GET /api/teams/1/plays': () => jsonRes(PLAYS),
        'PUT /api/teams/1/plays/order': () => jsonRes([PLAYS[1], PLAYS[0]]),
      })
      const wrapper = await mountPlays({ reorderable: true })

      await wrapper.find('button[aria-label="הזזה למטה"]').trigger('click')
      await flushPromises()

      const put = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
      expect(put[0]).toBe('/api/teams/1/plays/order')
      expect(JSON.parse(put[1].body)).toEqual([6, 5])
      expect(wrapper.findAll('li')[0].text()).toContain('שני')
    })

    it('has no move buttons unless reorderable', async () => {
      mockFetch({ 'GET /api/teams/1/plays': () => jsonRes(PLAYS) })
      const wrapper = await mountPlays()
      expect(wrapper.find('button[aria-label="הזזה למטה"]').exists()).toBe(false)
    })
  })

  it('checkbox field posts its boolean and shows a badge, not "true"', async () => {
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'pinned', label: 'נעוץ', type: 'checkbox' },
    ]
    mockFetch({
      'GET /api/teams/1/posts': () => jsonRes([{ id: 5, title: 'חשוב', pinned: true }]),
      'POST /api/teams/1/posts': () => jsonRes({ id: 6, title: 'חדש', pinned: true }, 201),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { teamId: 1, resource: 'posts', heading: 'עדכונים', fields },
    })
    await flushPromises()

    const row = wrapper.find('li')
    expect(row.find('.badge').text()).toBe('נעוץ')
    expect(row.text()).not.toContain('true')

    await wrapper.find('input[type="text"]').setValue('חדש')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ title: 'חדש', pinned: true })
  })
})
