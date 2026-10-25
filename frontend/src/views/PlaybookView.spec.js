import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const PLAYS = [
  { id: 1, title: 'GIF', notes: 'הערה', file_url: 'https://cdn/a.gif', url: null },
  { id: 2, title: 'וידאו', notes: null, file_url: 'https://cdn/b.mp4', url: null },
  { id: 3, title: 'מסמך', notes: null, file_url: 'https://cdn/c.pdf', url: null },
  { id: 4, title: 'קישור', notes: null, file_url: null, url: 'https://fastdraw.example.com/p/1' },
]
const MEMBER = { username: 'p', member_team_ids: [1] }
const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body })
const FAIL = () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) })

function mockFetch(overrides = {}) {
  const handlers = {
    'GET /api/auth/me': () => jsonRes(MEMBER),
    'GET /api/teams/1/plays': () => jsonRes(PLAYS),
    ...overrides,
  }
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    return handler ? Promise.resolve(handler()) : Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

describe('PlaybookView', () => {
  let router

  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', component: { template: '<div/>' } },
        { path: '/admin/login', name: 'admin-login', component: { template: '<div/>' } },
      ],
    })
  })

  afterEach(() => vi.restoreAllMocks())

  async function mountView() {
    await router.push('/')
    const { default: PlaybookView } = await import('./PlaybookView.vue')
    const wrapper = mount(PlaybookView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('renders each play by kind, in API order', async () => {
    mockFetch()
    const wrapper = await mountView()

    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['GIF', 'וידאו'])
    expect(wrapper.find('a[href="https://cdn/c.pdf"]').text()).toContain('מסמך')
    expect(wrapper.findAll('li').map((a) => a.text())[3]).toContain('קישור')
    expect(wrapper.find('img[src="https://cdn/a.gif"]').attributes('alt')).toBe('GIF')
    expect(wrapper.find('video[src="https://cdn/b.mp4"]').exists()).toBe(true)
    for (const href of ['https://cdn/c.pdf', 'https://fastdraw.example.com/p/1']) {
      const a = wrapper.find(`a[href="${href}"]`)
      expect(a.attributes('target')).toBe('_blank')
      expect(a.attributes('rel')).toContain('noopener')
    }
  })

  it('clicking an image play opens the in-page viewer', async () => {
    mockFetch()
    const wrapper = await mountView()
    expect(wrapper.find('a[href="https://cdn/a.gif"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="הגדלת תמונה: GIF"]').trigger('click')
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('dialog img').attributes('src')).toBe('https://cdn/a.gif')
  })

  it('shows an empty state', async () => {
    mockFetch({ 'GET /api/teams/1/plays': () => jsonRes([]) })
    expect((await mountView()).text()).toContain('עדיין אין מהלכים')
  })

  it('shows an error with retry', async () => {
    mockFetch({ 'GET /api/teams/1/plays': FAIL })
    const wrapper = await mountView()
    expect(wrapper.find('[role=alert]').text()).toContain('שגיאה בטעינת המהלכים')

    mockFetch()
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(4)
  })

  it('does not request or render plays for a non-member', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonRes({ username: 'p', member_team_ids: [2] }) })
    const wrapper = await mountView()

    expect(global.fetch.mock.calls.map(([u]) => u)).not.toContain('/api/teams/1/plays')
    expect(wrapper.text()).toContain('הדף זמין לחברי הקבוצה בלבד')
    expect(wrapper.text()).not.toContain('GIF')
  })

  it('anonymous preview shows the members-only state with sign-in', async () => {
    mockFetch()
    const { previewMode } = await import('../composables/useAuth')
    previewMode.value = 'anonymous'
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('הדף זמין לחברי הקבוצה בלבד')
    expect(wrapper.find('a[href^="/admin/login"]').exists()).toBe(true)
    expect(global.fetch.mock.calls.map(([u]) => u)).not.toContain('/api/teams/1/plays')
    previewMode.value = null
  })

  it('team admin edits plays inline (#468)', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonRes({ username: 'a', team_ids: [1], member_team_ids: [1] }), 'GET /api/teams/1/players': () => jsonRes([]) })
    const wrapper = await mountView()
    await wrapper.findAll('button').find((b) => b.text() === 'עריכת מהלכים').trigger('click')
    await flushPromises()
    expect(wrapper.find('button[aria-label="הזזה למעלה"]').exists()).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === 'סיום עריכה')).toBe(true)
  })

  it('a plain member sees no edit button (#468)', async () => {
    mockFetch({ 'GET /api/auth/me': () => jsonRes({ username: 'p', team_ids: [], member_team_ids: [1] }) })
    const wrapper = await mountView()
    expect(wrapper.findAll('button').some((b) => b.text() === 'עריכת מהלכים')).toBe(false)
  })
})
