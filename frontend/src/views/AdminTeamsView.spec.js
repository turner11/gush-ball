import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [{ id: 1, name: 'קבוצה א', slug: 'team-a' }]

// The ConfirmDialog's buttons render through an AlertDialog portal teleported to
// document.body, outside the mounted wrapper's own DOM subtree.
function body() {
  return new DOMWrapper(document.body)
}

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

describe('AdminTeamsView', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('clicking מחיקה opens a confirmation dialog and does not call DELETE until confirmed', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView)
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    expect(wrapper.text()).toContain('קבוצה א')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('confirming the dialog calls DELETE /api/teams/:id and removes the team from the list', async () => {
    mockFetch({
      'GET /api/teams': () => jsonRes(TEAMS),
      'DELETE /api/teams/1': () => jsonRes({}),
    })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { attachTo: document.body })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const confirmButton = body().findAll('button').find((b) => b.text() === 'אישור')
    await confirmButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.text()).not.toContain('קבוצה א')
  })

  it('cancelling the dialog leaves the team in the list and issues no DELETE request', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes(TEAMS) })

    const { default: AdminTeamsView } = await import('./AdminTeamsView.vue')
    const wrapper = mount(AdminTeamsView, { attachTo: document.body })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const cancelButton = body().findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('קבוצה א')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
