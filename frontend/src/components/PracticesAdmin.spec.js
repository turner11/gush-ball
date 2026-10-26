import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PracticesAdmin from './PracticesAdmin.vue'

const TEAM = { id: 1, name: 'קבוצה א', home_court_address: 'רחוב הכדור 1' }
const future = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 16) + ':00'
const row = (id, days, extra = {}) => ({ id, starts_at: future(days), duration_minutes: 90, location: null, notes: null, cancelled: false, ...extra })

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler(options))
  })
}
const jsonRes = (body, status = 200) => ({ ok: true, status, json: async () => structuredClone(body) })
const bodyOf = (url, method) => JSON.parse(global.fetch.mock.calls.find(([u, o]) => u === url && o?.method === method)[1].body)

async function mountAdmin(handlers) {
  mockFetch({ 'GET /api/teams/1/practices': () => jsonRes([]), ...handlers })
  const wrapper = mount(PracticesAdmin, { props: { team: TEAM }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('PracticesAdmin', () => {
  it("prefills location with the team's home court", async () => {
    const wrapper = await mountAdmin({})
    expect(wrapper.get('#practice-location').element.value).toBe('רחוב הכדור 1')
    expect(wrapper.text()).toContain('אין אימונים קרובים')
  })

  it('posts repeat_weekly_until and lists every returned practice', async () => {
    const wrapper = await mountAdmin({
      'POST /api/teams/1/practices': () => jsonRes([row(1, 2), row(2, 9), row(3, 16)], 201),
    })
    await wrapper.get('#practice-starts-at').setValue(future(2).slice(0, 16))
    await wrapper.get('#practice-repeat').setValue('2099-01-01')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(bodyOf('/api/teams/1/practices', 'POST')).toMatchObject({ repeat_weekly_until: '2099-01-01', location: 'רחוב הכדור 1', duration_minutes: 90 })
    expect(wrapper.findAll('ol > li')).toHaveLength(3)
    expect(wrapper.get('[role=status]').text()).toContain('נוספו 3 אימונים')
  })

  it('cancelling PATCHes cancelled: true', async () => {
    const wrapper = await mountAdmin({
      'GET /api/teams/1/practices': () => jsonRes([row(1, 2)]),
      'PATCH /api/teams/1/practices/1': () => jsonRes(row(1, 2, { cancelled: true })),
    })
    await wrapper.findAll('button').find((b) => b.text() === 'ביטול אימון').trigger('click')
    await flushPromises()

    expect(bodyOf('/api/teams/1/practices/1', 'PATCH')).toEqual({ cancelled: true })
    expect(wrapper.text()).toContain('בוטל')
    expect(wrapper.text()).toContain('שחזור')
  })

  it('bulk delete asks for confirmation then calls DELETE upcoming and empties the list', async () => {
    const wrapper = await mountAdmin({
      'GET /api/teams/1/practices': () => jsonRes([row(1, 2), row(2, 9)]),
      'DELETE /api/teams/1/practices/upcoming': () => ({ ok: true, status: 204, json: async () => null }),
    })
    await wrapper.findAll('button').find((b) => b.text() === 'מחיקת כל האימונים הקרובים').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body)
    expect(dialog.text()).toContain('למחוק 2 אימונים קרובים?')
    expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false)

    await dialog.findAll('[role="alertdialog"] button').find((b) => b.text() === 'מחיקה').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1/practices/upcoming', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).toContain('אין אימונים קרובים')
  })

  it('shows an error when loading fails', async () => {
    const wrapper = await mountAdmin({
      'GET /api/teams/1/practices': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }),
    })
    expect(wrapper.get('[role=alert]').text()).toContain('שגיאה בטעינת האימונים')
  })
})
