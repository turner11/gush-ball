import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ROWS = [
  { id: 3, created_at: '2026-01-03T10:00:00Z', user_id: 1, username: 'admin', action: 'update', entity_type: 'game', entity_id: 12, team_id: 5, changes: { team_score: [null, 90] } },
  { id: 2, created_at: '2026-01-02T10:00:00Z', user_id: null, username: 'gone', action: 'delete', entity_type: 'link', entity_id: 4, team_id: 5, changes: { label: ['L', null] } },
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

async function mountView(user = { username: 'admin', is_full_admin: true }) {
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: AdminAuditView } = await import('./AdminAuditView.vue')
  const wrapper = mount(AdminAuditView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

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

  it('non-full-admin sees the restriction and fetches nothing', async () => {
    mockFetch()
    const wrapper = await mountView({ username: 'x', team_ids: [1] })

    expect(wrapper.text()).toContain('פעולה זו זמינה למנהל ראשי בלבד')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
