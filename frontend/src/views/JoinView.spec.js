import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => data })
const failRes = (status) => ({ ok: false, status, statusText: 'x', json: async () => ({}) })

const TEAMS = [
  { id: 1, name: 'קבוצה א', club: 'Gush' },
  { id: 2, name: 'קבוצה ב', club: 'Gush' },
  { id: 3, name: 'קבוצה ג', club: null },
]

let calls
let me
function mockFetch(handlers = {}) {
  calls = []
  const all = {
    'GET /api/teams': () => jsonRes(TEAMS),
    'GET /api/auth/me': () => jsonRes(me),
    ...handlers,
  }
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    calls.push({ key, body: options.body && JSON.parse(options.body) })
    const handler = all[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}
const posted = () => calls.filter((c) => c.key === 'POST /api/memberships').map((c) => c.body)

async function mountJoin(user, options = {}) {
  me = user
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: JoinView } = await import('./JoinView.vue')
  const wrapper = mount(JoinView, options)
  await flushPromises()
  return wrapper
}

const PLAYER = { username: 'Dana', is_admin: false, memberships: [] }

describe('JoinView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('lists my requests with status badges and names', async () => {
    mockFetch()
    const wrapper = await mountJoin({
      ...PLAYER,
      memberships: [
        { id: 1, team_id: 1, club: null, role: 'pending' },
        { id: 2, team_id: null, club: 'Gush', role: 'member' },
      ],
    })
    expect(wrapper.text()).toContain('הבקשות שלי')
    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.text()).toContain('ממתין לאישור')
    expect(wrapper.text()).toContain('מועדון Gush')
    expect(wrapper.text()).toContain('חבר')
    expect(wrapper.text()).toContain('מנהל הקבוצה יאשר את הבקשה')
  })

  it('an approved member gets a link to the stats', async () => {
    mockFetch()
    const member = { ...PLAYER, can_view_stats: true, memberships: [{ id: 1, team_id: 1, club: null, role: 'member' }] }
    const global = { stubs: { RouterLink: RouterLinkStub } }
    let wrapper = await mountJoin(member, { global })
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe('/stats')
    expect(wrapper.text()).toContain('צפייה בסטטיסטיקה')

    vi.resetModules()
    wrapper = await mountJoin({ ...member, can_view_stats: false }, { global })
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('submits a team request, refreshes the session and shows the status', async () => {
    mockFetch({ 'POST /api/memberships': () => jsonRes({ id: 9 }, 201) })
    const wrapper = await mountJoin(PLAYER)
    await wrapper.find('#join-target').setValue(2)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(posted()).toEqual([{ team_id: 2 }])
    expect(calls.map((c) => c.key)).toContain('GET /api/auth/me')
    expect(wrapper.find('[role="status"]').text()).toBe('הבקשה נשלחה וממתינה לאישור')
  })

  it('submits a club request', async () => {
    mockFetch({ 'POST /api/memberships': () => jsonRes({ id: 9 }, 201) })
    const wrapper = await mountJoin(PLAYER)
    await wrapper.find('input[value="club"]').setValue()
    await wrapper.find('#join-target').setValue('Gush')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(posted()).toEqual([{ club: 'Gush' }])
  })

  it('hides the club radio when no team has a club', async () => {
    mockFetch({ 'GET /api/teams': () => jsonRes([{ id: 3, name: 'קבוצה ג', club: null }]) })
    const wrapper = await mountJoin(PLAYER)
    expect(wrapper.find('input[value="club"]').exists()).toBe(false)
  })

  it('leaves out already-requested teams', async () => {
    mockFetch()
    const wrapper = await mountJoin({ ...PLAYER, memberships: [{ id: 1, team_id: 1, club: null, role: 'pending' }] })
    const values = wrapper.findAll('#join-target option').map((o) => o.element.value)
    expect(values).toContain('2')
    expect(values).not.toContain('1')
  })

  it('shows the duplicate error on 409', async () => {
    mockFetch({ 'POST /api/memberships': () => failRes(409) })
    const wrapper = await mountJoin(PLAYER)
    await wrapper.find('#join-target').setValue(2)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('כבר שלחת')
  })

  it('shows an error with retry when teams fail to load', async () => {
    let fail = true
    mockFetch({ 'GET /api/teams': () => (fail ? failRes(500) : jsonRes(TEAMS)) })
    const wrapper = await mountJoin(PLAYER)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    fail = false
    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()
    expect(wrapper.find('#join-target').exists()).toBe(true)
  })
})
