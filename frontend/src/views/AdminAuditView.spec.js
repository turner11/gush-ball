import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ROWS = [
  { id: 3, created_at: '2026-01-03T10:00:00Z', user_id: 1, username: 'admin', action: 'update', entity_type: 'game', entity_id: 12, team_id: 5, changes: { team_score: [null, 90], status: ['scheduled', 'final'] } },
  { id: 2, created_at: '2026-01-02T22:30:00Z', user_id: null, username: 'gone', action: 'delete', entity_type: 'link', entity_id: 4, team_id: 5, changes: { label: ['L', null] } },
  { id: 1, created_at: '2026-01-01T10:00:00Z', user_id: null, username: null, action: 'create', entity_type: 'standing', entity_id: 7, team_id: null, changes: { won: [null, 3] } },
]
const TEAMS = [{ id: 5, name: 'נוער' }]

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body })

function mockFetch(auditHandler = () => jsonRes(ROWS)) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams') return Promise.resolve(jsonRes(TEAMS))
    if (url.startsWith('/api/audit-log')) return Promise.resolve(auditHandler(url))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}
const auditCalls = () => global.fetch.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/api/audit-log'))

let router
async function mountView(user = { username: 'admin', is_full_admin: true }, path = '/admin/audit') {
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: AdminAuditView } = await import('./AdminAuditView.vue')
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/audit', component: AdminAuditView }] })
  router.push(path)
  await router.isReady()
  const wrapper = mount(AdminAuditView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
const summaries = (w) => w.findAll('summary').map((s) => s.text().replace(/\s+/g, ' '))
const manyRows = (from, to) =>
  Array.from({ length: from - to + 1 }, (_, i) => ({ ...ROWS[0], id: from - i, changes: {} }))

describe('AdminAuditView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders actor labels, verbs, entities and before to after', async () => {
    mockFetch()
    const wrapper = await mountView()
    const text = wrapper.text()

    expect(text).toContain('admin')
    expect(text).toContain('gone (משתמש שנמחק)')
    expect(text).toContain('סקרייפר')
    expect(text).toContain('עודכן')
    expect(text).toContain('נמחק')
    expect(text).toContain('נוצר')
    expect(text).toContain('משחק #12')
    expect(text).toContain('team_score')
    expect(text).toContain('90')
    expect(text).toContain('—')
  })

  it('team select refetches with team_id', async () => {
    mockFetch()
    const wrapper = await mountView()

    await wrapper.find('#audit-team').setValue('5')
    await flushPromises()

    expect(auditCalls().at(-1)).toBe('/api/audit-log?team_id=5')
  })

  it('clicking an entity filters by it and shows a clear chip', async () => {
    mockFetch()
    const wrapper = await mountView()

    await wrapper.find('[aria-label="סינון לפי משחק #12"]').trigger('click')
    await flushPromises()

    expect(auditCalls().at(-1)).toBe('/api/audit-log?entity_type=game&entity_id=12')
    await wrapper.find('[data-testid="entity-chip"]').trigger('click')
    await flushPromises()
    expect(auditCalls().at(-1)).toBe('/api/audit-log')
  })

  it('error state offers a retry that refetches', async () => {
    let fail = true
    mockFetch(() => (fail ? { ok: false, status: 500, json: async () => ({ detail: 'boom' }) } : jsonRes(ROWS)))
    const wrapper = await mountView()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    fail = false
    await wrapper.find('[data-testid="list-error"] button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('משחק #12')
  })

  it('empty state with filters offers to clear them', async () => {
    mockFetch(() => jsonRes([]))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('אין שינויים להצגה')
    expect(wrapper.text()).not.toContain('נקה סינון')

    await wrapper.find('#audit-team').setValue('5')
    await flushPromises()
    expect(wrapper.text()).toContain('נקה סינון')
  })

  it.each([
    ['user', ['admin 1', 'gone (משתמש שנמחק) 1', 'סקרייפר 1']],
    ['date', null],
    ['field', ['team_score 1', 'status 1', 'label 1', 'won 1']],
    ['team', ['נוער 2', 'ללא קבוצה 1']],
    ['action', ['עודכן 1', 'נמחק 1', 'נוצר 1']],
  ])('groups by %s', async (mode, expected) => {
    mockFetch()
    const { formatIsraelDay } = await import('../lib/format')
    const wrapper = await mountView(undefined, `/admin/audit?group=${mode}`)
    const want =
      expected ?? [`${formatIsraelDay('2026-01-02T22:30:00Z')} 2`, `${formatIsraelDay('2026-01-01T10:00:00Z')} 1`]
    expect(summaries(wrapper)).toEqual(want)
  })

  it('group select writes ?group= and an invalid value falls back to flat', async () => {
    mockFetch()
    const wrapper = await mountView()
    expect(wrapper.find('details').exists()).toBe(false)
    await wrapper.find('#audit-group').setValue('user')
    await flushPromises()
    expect(router.currentRoute.value.query.group).toBe('user')
    expect(wrapper.find('details').exists()).toBe(true)

    const bogus = await mountView(undefined, '/admin/audit?group=bogus')
    expect(bogus.find('details').exists()).toBe(false)
  })

  it('load more appends the next page with before_id and the active filters', async () => {
    let n = 0
    mockFetch(() => jsonRes(n++ < 2 ? manyRows(300, 101) : [{ ...ROWS[0], id: 100, changes: {} }]))
    const wrapper = await mountView()
    await wrapper.find('#audit-team').setValue('5')
    await flushPromises()
    await wrapper.find('[data-testid="load-more"]').trigger('click')
    await flushPromises()

    expect(auditCalls().at(-1)).toBe('/api/audit-log?team_id=5&before_id=101')
    expect(wrapper.text()).toContain('מציג 201')
    expect(wrapper.find('[data-testid="load-more"]').exists()).toBe(false)
  })

  it('load more failure keeps loaded rows and shows an inline alert', async () => {
    let n = 0
    mockFetch(() => (n++ === 0 ? jsonRes(manyRows(300, 101)) : { ok: false, status: 500, json: async () => ({ detail: 'boom' }) }))
    const wrapper = await mountView()
    await wrapper.find('[data-testid="load-more"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('boom')
    expect(wrapper.text()).toContain('מציג 200')
    expect(wrapper.find('[data-testid="load-more"]').exists()).toBe(true)
  })

  it('grouped view shows the empty state', async () => {
    mockFetch(() => jsonRes([]))
    const wrapper = await mountView(undefined, '/admin/audit?group=user')
    expect(wrapper.text()).toContain('אין שינויים להצגה')
    expect(wrapper.find('details').exists()).toBe(false)
  })

  it('non-full-admin sees the restriction and fetches nothing', async () => {
    mockFetch()
    const wrapper = await mountView({ username: 'x', team_ids: [1] })

    expect(wrapper.text()).toContain('פעולה זו זמינה למנהל ראשי בלבד')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
