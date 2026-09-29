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
})
