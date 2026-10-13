import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

const team = (id, extra = {}) => ({
  id,
  name: `קבוצה ${id}`,
  name_en: null,
  club: null,
  slug: `team-${id}`,
  primary_color: null,
  secondary_color: null,
  logo_url: null,
  background: 'hoop-1',
  home_court_address: null,
  facebook_url: null,
  instagram_url: null,
  youtube_url: null,
  tiktok_url: null,
  twitter_url: null,
  ibasketball_team_url: null,
  ibasketball_league_url: null,
  ...extra,
})

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler(options))
  })
}

async function mountView(teams) {
  mockFetch({
    'GET /api/teams': () => res(teams),
    'GET /api/teams/admins': () => res([]),
    'PATCH /api/teams/1': () => res({}),
    'PATCH /api/teams/2': () => res({}),
  })
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:p(.*)*', component: { template: '<div/>' } },
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div/>' } },
      { path: '/admin/teams/import', name: 'admin-teams-import', component: { template: '<div/>' } },
    ],
  })
  const push = vi.spyOn(router, 'push')
  const { default: View } = await import('./AdminTeamsBatchEditView.vue')
  const wrapper = mount(View, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, push }
}

const patches = () => global.fetch.mock.calls.filter((c) => c[1]?.method === 'PATCH')
const bodyOf = (call) => JSON.parse(call[1].body)

describe('AdminTeamsBatchEditView', () => {
  beforeEach(async () => {
    vi.resetModules()
    ;(await import('../composables/useAuth')).useAuth().user.value = { id: 1, team_id: null, team_ids: null }
  })
  afterEach(() => vi.restoreAllMocks())

  it('PATCHes only the changed team with only the changed field', async () => {
    const { wrapper, push } = await mountView([team(1), team(2)])
    await wrapper.find('input[aria-label="כתובת — קבוצה 1"]').setValue('אולם חדש')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patches()).toHaveLength(1)
    expect(patches()[0][0]).toBe('/api/teams/1')
    expect(bodyOf(patches()[0])).toEqual({ home_court_address: 'אולם חדש' })
    expect(push).toHaveBeenCalledWith({ name: 'admin-teams' })
  })

  it('clearing an existing social sends null', async () => {
    const { wrapper } = await mountView([team(1, { facebook_url: 'https://www.facebook.com/x' })])
    await wrapper.find('#batch-1-facebook_url').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(bodyOf(patches()[0])).toEqual({ facebook_url: null })
  })

  it('a team with null colors left untouched sends no PATCH', async () => {
    const { wrapper } = await mountView([team(1)])
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(patches()).toHaveLength(0)
  })

  it('a non-full admin sees the full-admin-only notice', async () => {
    ;(await import('../composables/useAuth')).useAuth().user.value = { id: 2, team_id: 1, team_ids: [1] }
    const { wrapper } = await mountView([team(1)])

    expect(wrapper.find('.empty-state').text()).toContain('מנהל ראשי בלבד')
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
