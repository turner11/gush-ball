import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => data })
const failRes = (status, detail = 'x') => ({ ok: false, status, statusText: detail, json: async () => ({ detail }) })

const TEAMS = [{ id: 1, name: 'קבוצה א', club: null }]
const ME = {
  username: 'dana',
  display_name: 'Dana',
  is_admin: false,
  player_ids: [],
  memberships: [{ id: 5, team_id: 1, club: null, role: 'member' }],
}

let calls
const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => ({}) }))

function mockFetch(handlers = {}) {
  calls = []
  const all = { 'GET /api/teams': () => jsonRes(TEAMS), 'GET /api/auth/me': () => jsonRes(ME), ...handlers }
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    calls.push({ key, body: options.body && JSON.parse(options.body) })
    const handler = all[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}
const called = (key) => calls.filter((c) => c.key === key)

async function mountAccount(user = ME) {
  const auth = (await import('../composables/useAuth')).useAuth()
  auth.user.value = user
  const { default: AccountView } = await import('./AccountView.vue')
  const wrapper = mount(AccountView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return { wrapper, auth }
}
const confirmDialogs = (wrapper) => wrapper.findAllComponents({ name: 'ConfirmDialog' })

describe('AccountView', () => {
  beforeEach(() => {
    vi.resetModules()
    push.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('pre-fills the display name and saves it via PATCH /auth/me', async () => {
    mockFetch({ 'PATCH /api/auth/me': () => jsonRes({ ...ME, display_name: 'Dana C' }) })
    const { wrapper, auth } = await mountAccount()
    const input = wrapper.find('#account-display-name')
    expect(input.element.value).toBe('Dana')
    await input.setValue('Dana C')
    await wrapper.findAll('form')[0].trigger('submit')
    await flushPromises()
    expect(called('PATCH /api/auth/me')[0].body).toEqual({ display_name: 'Dana C' })
    expect(auth.user.value.display_name).toBe('Dana C')
    expect(wrapper.find('[role="status"]').text()).toBe('השם נשמר')
  })

  it('a password mismatch shows an error and sends nothing', async () => {
    mockFetch()
    const { wrapper } = await mountAccount()
    await wrapper.find('#account-current-password').setValue('oldpassword')
    await wrapper.find('#account-new-password').setValue('newpassword1')
    await wrapper.find('#account-confirm-password').setValue('different1')
    await wrapper.findAll('form')[1].trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('הסיסמאות אינן תואמות')
    expect(called('POST /api/auth/change-password')).toHaveLength(0)
  })

  it('a 400 from change-password says the current password is wrong; success clears the fields', async () => {
    let status = 400
    mockFetch({ 'POST /api/auth/change-password': () => (status === 400 ? failRes(400) : jsonRes({ ok: true })) })
    const { wrapper } = await mountAccount()
    const fill = async () => {
      await wrapper.find('#account-current-password').setValue('oldpassword')
      await wrapper.find('#account-new-password').setValue('newpassword1')
      await wrapper.find('#account-confirm-password').setValue('newpassword1')
      await wrapper.findAll('form')[1].trigger('submit')
      await flushPromises()
    }
    await fill()
    expect(wrapper.text()).toContain('הסיסמה הנוכחית שגויה')
    status = 200
    await fill()
    expect(called('POST /api/auth/change-password')[1].body).toEqual({
      current_password: 'oldpassword',
      new_password: 'newpassword1',
    })
    expect(wrapper.text()).toContain('חיבורים אחרים נותקו')
    expect(wrapper.find('#account-current-password').element.value).toBe('')
  })

  it('leaving a member row asks for confirmation, deletes it and refetches the session', async () => {
    mockFetch({ 'DELETE /api/memberships/mine/5': () => jsonRes(null, 204) })
    const { wrapper } = await mountAccount()
    await wrapper.find('button[aria-label^="עזיבה"]').trigger('click')
    expect(called('DELETE /api/memberships/mine/5')).toHaveLength(0)
    confirmDialogs(wrapper)[0].vm.$emit('confirm')
    await flushPromises()
    expect(called('DELETE /api/memberships/mine/5')).toHaveLength(1)
    expect(called('GET /api/auth/me')).toHaveLength(1)
  })

  it('an admin row has no leave button', async () => {
    mockFetch()
    const { wrapper } = await mountAccount({ ...ME, memberships: [{ id: 6, team_id: 1, club: null, role: 'admin' }] })
    expect(wrapper.find('button[aria-label^="עזיבה"]').exists()).toBe(false)
  })

  it('lists linked players with a profile link, and shows an empty state without any', async () => {
    mockFetch({ 'GET /api/players/7': () => jsonRes({ id: 7, name: 'דנה', team_id: 1, images: [] }) })
    let { wrapper } = await mountAccount({ ...ME, player_ids: [7] })
    expect(wrapper.text()).toContain('דנה')
    const link = wrapper.findAllComponents(RouterLinkStub).find((l) => l.props('to') === '/players/7')
    expect(link.exists()).toBe(true)

    vi.resetModules()
    mockFetch()
    ;({ wrapper } = await mountAccount())
    expect(wrapper.text()).toContain('אין שחקן מקושר לחשבון')
  })

  it('deleting the account calls DELETE /auth/me, clears the user and goes home', async () => {
    mockFetch({ 'DELETE /api/auth/me': () => jsonRes(null, 204) })
    const { wrapper, auth } = await mountAccount()
    confirmDialogs(wrapper).at(-1).vm.$emit('confirm')
    await flushPromises()
    expect(called('DELETE /api/auth/me')).toHaveLength(1)
    expect(auth.user.value).toBeNull()
    expect(push).toHaveBeenCalledWith('/')
  })

  it('a 409 on delete shows the server message and stays', async () => {
    mockFetch({ 'DELETE /api/auth/me': () => failRes(409, 'לא ניתן למחוק את המנהל הראשי האחרון') })
    const { wrapper, auth } = await mountAccount()
    confirmDialogs(wrapper).at(-1).vm.$emit('confirm')
    await flushPromises()
    expect(wrapper.text()).toContain('לא ניתן למחוק את המנהל הראשי האחרון')
    expect(auth.user.value).not.toBeNull()
    expect(push).not.toHaveBeenCalled()
  })
})
