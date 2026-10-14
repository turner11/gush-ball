import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 1, username: 'admin', email: 'admin@x.com', memberships: [] },
  {
    id: 2,
    username: 'dana',
    email: 'dana@club.com',
    memberships: [{ team_id: 5, team_name: 'נוער', club: null, role: 'pending' }],
  },
]

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler())
  })
}
const jsonRes = (body, status = 200) => ({ ok: true, status, json: async () => body })
const body = () => new DOMWrapper(document.body)

async function mountView(user = { username: 'admin' }) {
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: AdminUsersView } = await import('./AdminUsersView.vue')
  const wrapper = mount(AdminUsersView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('AdminUsersView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('lists users with membership badges and filters by email', async () => {
    mockFetch({ 'GET /api/users': () => jsonRes(USERS) })
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('נוער · ממתין')
    await wrapper.find('#admin-user-search').setValue('dana@')
    expect(wrapper.findAll('ul.card > li')).toHaveLength(1)
    expect(wrapper.text()).toContain('dana')

    await wrapper.find('#admin-user-search').setValue('nobody')
    expect(wrapper.text()).toContain('נקה חיפוש')
  })

  it('delete asks for confirmation, then sends DELETE and removes the row; own row has no delete', async () => {
    mockFetch({
      'GET /api/users': () => jsonRes(USERS),
      'DELETE /api/users/2': () => ({ ok: true, status: 204 }),
    })
    const wrapper = await mountView()

    expect(wrapper.find('[aria-label="מחיקת admin"]').exists()).toBe(false)
    await wrapper.find('[aria-label="מחיקת dana"]').trigger('click')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/users/2', expect.anything())

    await body().find('.btn-danger').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('dana')
  })

  it('non-full-admin sees the full-admin-only message and fetches nothing', async () => {
    mockFetch({})
    const wrapper = await mountView({ username: 'x', team_ids: [1] })

    expect(wrapper.text()).toContain('פעולה זו זמינה למנהל ראשי בלבד')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
