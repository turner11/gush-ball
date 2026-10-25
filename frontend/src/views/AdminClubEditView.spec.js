import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NO_ABOUT = { about_title: null, about_title_en: null, about: null, about_en: null, about_images: [], about_links: [], officials: [] }
const CLUBS = [{ id: 5, name: 'מכבי', name_en: null, ibasketball_url: null, ...NO_ABOUT }]
const TEAMS = [
  { id: 1, name: 'קבוצה א', name_en: null, club: 'מכבי' },
  { id: 2, name: 'קבוצה ב', name_en: null, club: 'אחר' },
]

const jsonRes = (data) => ({ ok: true, status: 200, json: async () => data })

async function mountAt(id) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/clubs') return Promise.resolve(jsonRes(CLUBS))
    if (url === '/api/teams') return Promise.resolve(jsonRes(TEAMS))
    if (url === '/api/clubs/5/posts') return Promise.resolve(jsonRes([]))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
  vi.doMock('vue-router', async (orig) => ({ ...(await orig()), useRoute: () => ({ params: { id } }), useRouter: () => ({ push: vi.fn() }) }))
  const { default: AdminClubEditView } = await import('./AdminClubEditView.vue')
  const wrapper = mount(AdminClubEditView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  return wrapper
}

describe('AdminClubEditView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('renders the posts editor for the club, the about form and the club teams', async () => {
    const w = await mountAt('5')

    expect(w.get('h1').text()).toBe('מכבי')
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/clubs/5/posts')
    expect(w.text()).toContain('טקסט')
    const tos = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(tos).toContainEqual({ name: 'admin-team-edit', params: { id: 1 } })
    expect(tos).not.toContainEqual({ name: 'admin-team-edit', params: { id: 2 } })
  })

  it('an unknown club id shows the not-found state', async () => {
    const w = await mountAt('99')

    expect(w.text()).toContain('המועדון לא נמצא')
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))).toContainEqual({ name: 'admin-clubs' })
  })
})
