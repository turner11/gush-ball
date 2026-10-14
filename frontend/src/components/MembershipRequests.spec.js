import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => structuredClone(data) })
const failRes = { ok: false, status: 500, statusText: 'x', json: async () => ({}) }
const body = () => new DOMWrapper(document.body) // ConfirmDialog teleports to body

const ROWS = [
  { id: 3, username: 'Dana Cohen', role: 'pending', email_hint: 'd***@gmail.com', team_id: 1, team_name: 'קבוצה א', club: null },
  { id: 4, username: 'Noa', role: 'pending', email_hint: null, team_id: null, team_name: null, club: 'Gush' },
  { id: 5, username: 'Yael', role: 'member', email_hint: null, team_id: 1, team_name: 'קבוצה א', club: null },
]

let calls
function mockFetch(handlers) {
  calls = []
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    calls.push(key)
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}

async function mountQueue() {
  const { default: MembershipRequests } = await import('./MembershipRequests.vue')
  const wrapper = mount(MembershipRequests, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('MembershipRequests', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('shows an empty state', async () => {
    mockFetch({ 'GET /api/memberships': () => jsonRes([]) })
    const wrapper = await mountQueue()
    expect(wrapper.text()).toContain('אין בקשות ממתינות')
    expect(wrapper.text()).toContain('אין חברים מאושרים')
  })

  it('renders team and club rows with a count', async () => {
    mockFetch({ 'GET /api/memberships': () => jsonRes(ROWS) })
    const wrapper = await mountQueue()
    expect(wrapper.text()).toContain('Dana Cohen')
    expect(wrapper.text()).toContain('קבוצה: קבוצה א')
    expect(wrapper.text()).toContain('מועדון: Gush')
    expect(wrapper.find('.badge-muted').text()).toBe('2')
  })

  it('shows the masked email and flags unverified requesters', async () => {
    mockFetch({ 'GET /api/memberships': () => jsonRes(ROWS) })
    const wrapper = await mountQueue()
    const rows = wrapper.findAll('li')
    expect(rows[0].text()).toContain('d***@gmail.com')
    expect(rows[1].find('.badge-loss').text()).toBe('אימייל לא מאומת')
  })

  it('approve moves the row into the members list', async () => {
    mockFetch({
      'GET /api/memberships': () => jsonRes(ROWS),
      'POST /api/memberships/3/approve': () => jsonRes(null, 204),
    })
    const wrapper = await mountQueue()
    await wrapper.find('button[aria-label="אישור הבקשה של Dana Cohen"]').trigger('click')
    await flushPromises()
    expect(calls).toContain('POST /api/memberships/3/approve')
    expect(wrapper.find('button[aria-label="אישור הבקשה של Dana Cohen"]').exists()).toBe(false)
    expect(wrapper.find('details').text()).toContain('Dana Cohen')
    expect(wrapper.find('button[aria-label="הסרת Dana Cohen"]').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').text()).toBe('הבקשה של Dana Cohen אושרה')
  })

  it('remove member only DELETEs after the confirm dialog', async () => {
    mockFetch({
      'GET /api/memberships': () => jsonRes(ROWS),
      'DELETE /api/memberships/5': () => jsonRes(null, 204),
    })
    const wrapper = await mountQueue()
    await wrapper.find('button[aria-label="הסרת Yael"]').trigger('click')
    await flushPromises()
    expect(calls).not.toContain('DELETE /api/memberships/5')
    expect(body().text()).toContain('להסיר את Yael מקבוצה: קבוצה א?')
    await body().find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(calls).toContain('DELETE /api/memberships/5')
    expect(wrapper.find('button[aria-label="הסרת Yael"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toBe('Yael הוסר/ה')
  })

  it('reject only DELETEs after the confirm dialog', async () => {
    mockFetch({
      'GET /api/memberships': () => jsonRes(ROWS),
      'DELETE /api/memberships/4': () => jsonRes(null, 204),
    })
    const wrapper = await mountQueue()
    await wrapper.find('button[aria-label="דחיית הבקשה של Noa"]').trigger('click')
    await flushPromises()
    expect(calls).not.toContain('DELETE /api/memberships/4')
    expect(body().text()).toContain('לדחות את הבקשה של Noa?')
    await body().find('button.btn-danger').trigger('click')
    await flushPromises()
    expect(calls).toContain('DELETE /api/memberships/4')
    expect(wrapper.text()).not.toContain('מועדון: Gush')
  })

  it('shows an error with retry when loading fails, and retry reloads', async () => {
    let fail = true
    mockFetch({ 'GET /api/memberships': () => (fail ? failRes : jsonRes(ROWS)) })
    const wrapper = await mountQueue()
    expect(wrapper.find('[role="alert"]').text()).toContain('שגיאה בטעינת הבקשות')
    fail = false
    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Dana Cohen')
  })

  it('keeps the row and shows an error when an action fails', async () => {
    mockFetch({ 'GET /api/memberships': () => jsonRes(ROWS), 'POST /api/memberships/3/approve': () => failRes })
    const wrapper = await mountQueue()
    await wrapper.find('button[aria-label="אישור הבקשה של Dana Cohen"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('שגיאה בעדכון הבקשה')
    expect(wrapper.text()).toContain('Dana Cohen')
  })
})
