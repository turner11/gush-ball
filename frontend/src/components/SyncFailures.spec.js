import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => structuredClone(data) })
const failRes = { ok: false, status: 500, statusText: 'x', json: async () => ({}) }
const FAILURES = [
  { team_id: 4, team_name: 'קבוצה א', message: 'games: boom', failed_at: '2026-10-15T21:00:00Z' },
  { team_id: 5, team_name: 'קבוצה ב', message: 'standings: bad url', failed_at: '2026-10-14T21:00:00Z' },
]
const RouterLink = { props: ['to'], template: '<a :href="`/admin/teams/${to.params.id}`"><slot /></a>' }

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler())
  })
}

async function mountFailures() {
  const { default: SyncFailures } = await import('./SyncFailures.vue')
  const wrapper = mount(SyncFailures, { global: { stubs: { RouterLink } } })
  await flushPromises()
  return wrapper
}

describe('SyncFailures', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('lists each failure with its message and a link to the team editor', async () => {
    mockFetch({ 'GET /api/sync/failures': () => jsonRes(FAILURES) })
    const wrapper = await mountFailures()
    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.text()).toContain('games: boom')
    expect(wrapper.findAll('a').map((a) => a.attributes('href'))).toEqual(['/admin/teams/4', '/admin/teams/5'])
  })

  it('dismiss deletes the note and removes the row', async () => {
    mockFetch({ 'GET /api/sync/failures': () => jsonRes(FAILURES), 'DELETE /api/sync/failures/4': () => jsonRes(null, 204) })
    const wrapper = await mountFailures()
    await wrapper.find('button[aria-label="סגירת ההתראה של קבוצה א"]').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith('/api/sync/failures/4', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('קבוצה א')
    expect(wrapper.text()).toContain('קבוצה ב')
  })

  it('renders nothing when there are no failures', async () => {
    mockFetch({ 'GET /api/sync/failures': () => jsonRes([]) })
    const wrapper = await mountFailures()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('shows an alert on load failure and retry re-fetches', async () => {
    mockFetch({ 'GET /api/sync/failures': () => failRes })
    const wrapper = await mountFailures()
    expect(wrapper.find('[role=alert]').exists()).toBe(true)
    mockFetch({ 'GET /api/sync/failures': () => jsonRes(FAILURES) })
    await wrapper.find('button.btn-secondary').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('games: boom')
  })

  it('keeps the row and shows an error when dismiss fails', async () => {
    mockFetch({ 'GET /api/sync/failures': () => jsonRes(FAILURES), 'DELETE /api/sync/failures/4': () => failRes })
    const wrapper = await mountFailures()
    await wrapper.find('button[aria-label="סגירת ההתראה של קבוצה א"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('קבוצה א')
    expect(wrapper.find('[role=alert]').text()).toContain('שגיאה בסגירת ההתראה')
  })

  describe('grouping', () => {
    const SP = 'standings: No sp-league-table found on page'
    const GROUPED = [
      { team_id: 1, team_name: 'קבוצה א', message: SP, failed_at: '2026-10-15T10:00:00Z' },
      { team_id: 2, team_name: 'קבוצה ב', message: 'games: The read operation timed out', failed_at: '2026-10-15T10:00:00Z' },
      { team_id: 3, team_name: 'קבוצה ג', message: SP, failed_at: '2026-10-14T10:00:00Z' },
    ]
    const groupsOf = (w) => w.findAll('[data-testid=failure-group]')
    const dismissAll = (g) => g.find('button[aria-label^="סגירת כל ההתראות"]')
    const toggle = (w, label) => w.findAll('.segmented-item').find((b) => b.text() === label)

    it('groups by error by default, one dismiss-all per repeated error', async () => {
      mockFetch({ 'GET /api/sync/failures': () => jsonRes(GROUPED) })
      const wrapper = await mountFailures()
      const groups = groupsOf(wrapper)
      expect(groups).toHaveLength(2)
      expect(groups[0].text()).toContain(SP)
      expect(dismissAll(groups[0]).attributes('aria-label')).toContain('(2)')
      expect(dismissAll(groups[1]).exists()).toBe(false)
    })

    it('switching to date groups rows by calendar day', async () => {
      mockFetch({ 'GET /api/sync/failures': () => jsonRes(GROUPED) })
      const wrapper = await mountFailures()
      await toggle(wrapper, 'תאריך').trigger('click')
      expect(toggle(wrapper, 'תאריך').attributes('aria-pressed')).toBe('true')
      const groups = groupsOf(wrapper)
      expect(groups).toHaveLength(2)
      expect(groups[0].text()).toContain('קבוצה א')
      expect(groups[0].text()).toContain('קבוצה ב')
      expect(groups[1].text()).toContain('קבוצה ג')
    })

    it('switching to team gives one group per team', async () => {
      mockFetch({ 'GET /api/sync/failures': () => jsonRes(GROUPED) })
      const wrapper = await mountFailures()
      await toggle(wrapper, 'קבוצה').trigger('click')
      const groups = groupsOf(wrapper)
      expect(groups).toHaveLength(3)
      groups.forEach((g) => expect(dismissAll(g).exists()).toBe(false))
    })

    it('dismiss-all deletes every row in the group in one click', async () => {
      mockFetch({
        'GET /api/sync/failures': () => jsonRes(GROUPED),
        'DELETE /api/sync/failures/1': () => jsonRes(null, 204),
        'DELETE /api/sync/failures/3': () => jsonRes(null, 204),
      })
      const wrapper = await mountFailures()
      await dismissAll(groupsOf(wrapper)[0]).trigger('click')
      await flushPromises()
      expect(global.fetch).toHaveBeenCalledWith('/api/sync/failures/1', expect.objectContaining({ method: 'DELETE' }))
      expect(global.fetch).toHaveBeenCalledWith('/api/sync/failures/3', expect.objectContaining({ method: 'DELETE' }))
      expect(wrapper.text()).not.toContain('קבוצה א')
      expect(wrapper.text()).not.toContain('קבוצה ג')
      expect(wrapper.text()).toContain('קבוצה ב')
    })

    it('dismiss-all keeps the rows that failed and shows an error', async () => {
      mockFetch({
        'GET /api/sync/failures': () => jsonRes(GROUPED),
        'DELETE /api/sync/failures/1': () => jsonRes(null, 204),
        'DELETE /api/sync/failures/3': () => failRes,
      })
      const wrapper = await mountFailures()
      await dismissAll(groupsOf(wrapper)[0]).trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('קבוצה א')
      expect(wrapper.text()).toContain('קבוצה ג')
      expect(wrapper.find('[role=alert]').text()).toContain('שגיאה בסגירת ההתראה')
    })
  })
})
