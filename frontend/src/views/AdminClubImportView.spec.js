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
}

const createButton = (wrapper) => wrapper.findAll('button').find((b) => b.text().startsWith('יצירת'))
const bodyOf = (call) => JSON.parse(call[1].body)

describe('AdminClubImportView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('scanning posts the club url and renders a row per team prefilled with the chosen colors', async () => {
    mockFetch({ 'POST /api/teams/club-preview': () => res(PREVIEW) })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(bodyOf(global.fetch.mock.calls[0])).toEqual({ club_url: 'https://ibasketball.co.il/club/3901-2/' })
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.find('input[aria-label="צבע ראשי — אליצור"]').element.value).toBe('#112233')
    expect(wrapper.find('input[aria-label="צבע משני — אליצור"]').element.value).toBe('#445566')
  })

  it('shows the empty state when every club team already exists', async () => {
    mockFetch({ 'POST /api/teams/club-preview': () => res([]) })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(wrapper.find('.empty-state').text()).toContain('כבר קיימות')
  })

  it('shows an error and keeps the form when the scan fails', async () => {
    mockFetch({ 'POST /api/teams/club-preview': () => res({ detail: 'x' }, 502) })
    const { wrapper } = await mountView()
    await scan(wrapper)

    expect(wrapper.find('[role="alert"]').text()).toContain('הסריקה נכשלה')
    expect(wrapper.find('#club-url').element.value).toBe('https://ibasketball.co.il/club/3901-2/')
  })

  it('creating posts one POST /api/teams per remaining row with edited fields, skipping removed rows and empty fields', async () => {
    mockFetch({
      'POST /api/teams/club-preview': () => res(PREVIEW),
      'POST /api/teams': () => res({ id: 1 }, 201),
    })
    const { wrapper, push } = await mountView()
    await scan(wrapper)

    await wrapper.find('input[aria-label="שם באנגלית — אליצור"]').setValue('Elitzur')
    await wrapper.find('select[aria-label="רקע — אליצור"]').setValue('hoop-2')
    await wrapper.find('button[aria-label="הסרה — אליצור 3"]').trigger('click')
    await createButton(wrapper).trigger('click')
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
      'POST /api/teams/club-preview': () => res(PREVIEW),
      'POST /api/teams': () => (++n === 2 ? res({ detail: 'bad' }, 422) : res({ id: n }, 201)),
    })
    const { wrapper, push } = await mountView()
    await scan(wrapper)
    await createButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.find('tbody').text()).toContain('שגיאה ביצירת הקבוצה')
    expect(wrapper.text()).toContain('נוצרו 2, נכשלו 1')
    expect(push).not.toHaveBeenCalled()
  })
})
