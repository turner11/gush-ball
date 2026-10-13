import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PREVIEW = [
  {
    name: 'אליצור',
    ibasketball_team_url: 'https://ibasketball.co.il/team/1-a/',
    ibasketball_league_url: 'https://ibasketball.co.il/league/2026-1/',
    league_name: 'ליגה א',
    home_court_address: 'אולם 1',
    logo_url: null,
  },
  {
    name: 'אליצור 2',
    ibasketball_team_url: 'https://ibasketball.co.il/team/2-a/',
    ibasketball_league_url: null,
    league_name: 'ליגה ב',
    home_court_address: null,
    logo_url: null,
  },
  {
    name: 'אליצור 3',
    ibasketball_team_url: 'https://ibasketball.co.il/team/3-a/',
    ibasketball_league_url: null,
    league_name: null,
    home_court_address: null,
    logo_url: null,
  },
]

function res(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

const STARTED = () => res({ status: 'started' }, 202)
const scanOk = (rows) => ({
  'GET /api/teams/admins': () => res([{ id: 5, username: 'coach', team_id: 9, team_name: 'X' }]),
  'POST /api/teams/club-preview': STARTED,
  'GET /api/teams/club-preview/status': () => res({ running: false, rows, error: null }),
})

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler(options))
  })
}

async function mountView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:p(.*)*', component: { template: '<div/>' } },
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div/>' } },
    ],
  })
  const push = vi.spyOn(router, 'push')
  const { default: View } = await import('./AdminClubImportView.vue')
  const wrapper = mount(View, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, push }
}

async function scan(wrapper) {
  await wrapper.find('#club-url').setValue('https://ibasketball.co.il/club/3901-2/')
  await wrapper.find('#club-primary-color').setValue('#112233')
  await wrapper.find('#club-secondary-color').setValue('#445566')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  vi.advanceTimersByTime(3000) // one status poll
  await flushPromises()
}

const submitCreate = (wrapper) => wrapper.find('form').trigger('submit')
const bodyOf = (call) => JSON.parse(call[1].body)

describe('AdminClubImportView', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('scanning posts the club url and renders a row per team prefilled with the chosen colors', async () => {
    mockFetch({ ...scanOk(PREVIEW) })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(bodyOf(global.fetch.mock.calls.find((c) => c[1]?.method === 'POST'))).toEqual({ club_url: 'https://ibasketball.co.il/club/3901-2/' })
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.find('input[aria-label="צבע ראשי — אליצור"]').element.value).toBe('#112233')
    expect(wrapper.find('input[aria-label="צבע משני — אליצור"]').element.value).toBe('#445566')
  })

  it('shows the empty state when every club team already exists', async () => {
    mockFetch({ ...scanOk([]) })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(wrapper.find('.empty-state').text()).toContain('כבר קיימות')
  })

  it('shows an error and keeps the form when the scan fails', async () => {
    mockFetch({
      'POST /api/teams/club-preview': STARTED,
      'GET /api/teams/club-preview/status': () => res({ running: false, rows: null, error: 'unreachable' }),
    })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('לא ניתן לטעון')
    expect(wrapper.find('#club-url').element.value).toBe('https://ibasketball.co.il/club/3901-2/')
  })

  it('does not poll status when unmounted while the start request is pending', async () => {
    let resolveStart
    mockFetch({
      'POST /api/teams/club-preview': () => new Promise((r) => (resolveStart = r)),
      'GET /api/teams/club-preview/status': () => res({ running: true, rows: null, error: null }),
    })
    const { wrapper } = await mountView()
    await wrapper.find('#club-url').setValue('https://ibasketball.co.il/club/3901-2/')
    await wrapper.find('form').trigger('submit')
    wrapper.unmount()
    resolveStart(STARTED())
    await flushPromises()
    vi.advanceTimersByTime(10000)
    await flushPromises()

    // the mount-time club suggestions fetch plus the one start POST, and no status polls
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('shows a loading state until the status poll reports the scan finished', async () => {
    let running = true
    mockFetch({
      'POST /api/teams/club-preview': STARTED,
      'GET /api/teams/club-preview/status': () =>
        res({ running, rows: running ? null : PREVIEW, error: null }),
    })
    const { wrapper } = await mountView()
    await scan(wrapper)
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)

    running = false
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
  })

  it('shows an error when the scan cannot be started', async () => {
    mockFetch({ 'POST /api/teams/club-preview': () => res({ detail: 'busy' }, 409) })
    const { wrapper } = await mountView()
    await scan(wrapper)
    expect(wrapper.find('[role="alert"]').text()).toContain('כבר רצה')
  })

  it('creating posts one POST /api/teams per remaining row with edited fields, skipping removed rows and empty fields', async () => {
    mockFetch({
      ...scanOk(PREVIEW),
      'POST /api/teams': () => res({ id: 1 }, 201),
    })
    const { wrapper, push } = await mountView()
    await scan(wrapper)

    await wrapper.find('input[aria-label="שם באנגלית — אליצור"]').setValue('Elitzur')
    await wrapper.find('select[aria-label="רקע — אליצור"]').setValue('hoop-2')
    await wrapper.find('button[aria-label="הסרה מהרשימה — אליצור 3"]').trigger('click')
    await submitCreate(wrapper)
    await flushPromises()

    const posts = global.fetch.mock.calls.filter((c) => c[1]?.method === 'POST' && c[0] === '/api/teams')
    expect(posts).toHaveLength(2)
    const first = bodyOf(posts[0])
    expect(first).toMatchObject({
      name: 'אליצור',
      name_en: 'Elitzur',
      primary_color: '#112233',
      secondary_color: '#445566',
      background: 'hoop-2',
      ibasketball_team_url: 'https://ibasketball.co.il/team/1-a/',
      home_court_address: 'אולם 1',
    })
    expect(first).not.toHaveProperty('facebook_url')
    expect(bodyOf(posts[1])).not.toHaveProperty('name_en')
    expect(push).toHaveBeenCalledWith({ name: 'admin-teams' })
  })

  it('a failed row stays with its error while created rows are removed', async () => {
    let n = 0
    mockFetch({
      ...scanOk(PREVIEW),
      'POST /api/teams': () => (++n === 2 ? res({ detail: 'bad' }, 422) : res({ id: n }, 201)),
    })
    const { wrapper, push } = await mountView()
    await scan(wrapper)
    await submitCreate(wrapper)
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.find('tbody').text()).toContain('שגיאה בשמירת הקבוצה')
    expect(wrapper.text()).toContain('נשמרו 2, נכשלו 1')
    expect(push).not.toHaveBeenCalled()
  })

  it('sends the shared club with every created team', async () => {
    mockFetch({
      'GET /api/teams': () => res([{ id: 1, club: 'Gush' }, { id: 2, club: 'Gush' }, { id: 3, club: null }]),
      ...scanOk(PREVIEW),
      'POST /api/teams': () => res({ id: 1 }, 201),
    })
    const { wrapper } = await mountView()
    expect(wrapper.findAll('#club-options option')).toHaveLength(1)
    await wrapper.find('#club-name').setValue('Gush')
    await scan(wrapper)
    await submitCreate(wrapper)
    await flushPromises()

    const posts = global.fetch.mock.calls.filter((c) => c[1]?.method === 'POST' && c[0] === '/api/teams')
    expect(posts).toHaveLength(3)
    for (const call of posts) expect(bodyOf(call).club).toBe('Gush')
  })

  it('sends an edited address', async () => {
    mockFetch({ ...scanOk(PREVIEW), 'POST /api/teams': () => res({ id: 1 }, 201) })
    const { wrapper } = await mountView()
    await scan(wrapper)
    await wrapper.find('input[aria-label="כתובת — אליצור"]').setValue('אולם חדש')
    await submitCreate(wrapper)
    await flushPromises()

    const posts = global.fetch.mock.calls.filter((c) => c[1]?.method === 'POST' && c[0] === '/api/teams')
    expect(bodyOf(posts[0]).home_court_address).toBe('אולם חדש')
    expect(bodyOf(posts[0])).not.toHaveProperty('admin_id')
  })

  it('a failed admin assignment keeps the row and a retry does not create the team twice', async () => {
    let put = 0
    mockFetch({
      ...scanOk([PREVIEW[0]]),
      'POST /api/teams': () => res({ id: 7 }, 201),
      'PUT /api/teams/7/admins/5': () => (++put === 1 ? res({ detail: 'x' }, 404) : res(null, 204)),
    })
    const { wrapper, push } = await mountView()
    await scan(wrapper)
    await wrapper.find('select[aria-label="מנהל — אליצור"]').setValue(5)
    await submitCreate(wrapper)
    await flushPromises()
    expect(wrapper.find('tbody').text()).toContain('שיוך המנהל נכשל')

    await submitCreate(wrapper)
    await flushPromises()
    const posts = global.fetch.mock.calls.filter((c) => c[1]?.method === 'POST' && c[0] === '/api/teams')
    expect(posts).toHaveLength(1)
    expect(push).toHaveBeenCalledWith({ name: 'admin-teams' })
  })

  it('club admin sees the full-admin-only notice', async () => {
    mockFetch({ 'GET /api/teams': () => res([]) })
    ;(await import('../composables/useAuth')).useAuth().user.value = { username: 'c', team_id: null, team_ids: [1] }
    const { wrapper } = await mountView()

    expect(wrapper.find('.empty-state').text()).toContain('מנהל ראשי בלבד')
    expect(wrapper.find('#club-url').exists()).toBe(false)
  })
})
