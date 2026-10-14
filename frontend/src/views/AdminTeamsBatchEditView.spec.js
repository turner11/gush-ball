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
    'GET /api/teams/assignable-users': () => res([]),
    'PATCH /api/teams/1': () => res({}),
    'PATCH /api/teams/2': () => res({}),
    'PATCH /api/teams/3': () => res({}),
    'PATCH /api/teams/4': () => res({}),
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

  describe('club filter', () => {
    const mixed = () => [team(1, { club: 'גוש' }), team(2, { club: 'גוש' }), team(3, { club: 'אחר' }), team(4)]
    const nameInputs = (w) => w.findAll('input[aria-label^="שם — "]').map((i) => i.attributes('aria-label'))

    it('defaults to all teams', async () => {
      const { wrapper } = await mountView(mixed())
      expect(nameInputs(wrapper)).toHaveLength(4)
      expect(wrapper.find('#batch-club-filter').element.value).toBe('__all__')
      expect(wrapper.find('button[type="submit"]').text()).toContain('4')
    })

    it('filtering by a club shows and saves only that club', async () => {
      const { wrapper } = await mountView(mixed())
      await wrapper.find('#batch-club-filter').setValue('גוש')
      expect(nameInputs(wrapper)).toEqual(['שם — קבוצה 1', 'שם — קבוצה 2'])
      await wrapper.find('input[aria-label="כתובת — קבוצה 1"]').setValue('א')
      await wrapper.find('input[aria-label="כתובת — קבוצה 2"]').setValue('ב')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(patches().map((c) => c[0]).sort()).toEqual(['/api/teams/1', '/api/teams/2'])
    })

    it('"no club" shows only teams without a club', async () => {
      const { wrapper } = await mountView(mixed())
      await wrapper.find('#batch-club-filter').setValue('__none__')
      expect(nameInputs(wrapper)).toEqual(['שם — קבוצה 4'])
    })

    it('edits survive switching filters', async () => {
      const { wrapper } = await mountView(mixed())
      await wrapper.find('#batch-club-filter').setValue('אחר')
      await wrapper.find('input[aria-label="כתובת — קבוצה 3"]').setValue('אולם')
      await wrapper.find('#batch-club-filter').setValue('__all__')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(patches()).toHaveLength(1)
      expect(patches()[0][0]).toBe('/api/teams/3')
      expect(bodyOf(patches()[0])).toEqual({ home_court_address: 'אולם' })
    })

    it('rows removed or already saved do not come back on a filter change', async () => {
      const { wrapper } = await mountView(mixed())
      await wrapper.find('#batch-club-filter').setValue('גוש')
      await wrapper.find('button[aria-label="הסרה מהרשימה — קבוצה 1"]').trigger('click')
      await wrapper.find('#batch-club-filter').setValue('__all__')
      expect(nameInputs(wrapper)).toEqual(['שם — קבוצה 2', 'שם — קבוצה 3', 'שם — קבוצה 4'])
    })

    it('notes edits hidden by the filter', async () => {
      const { wrapper } = await mountView(mixed())
      expect(wrapper.text()).not.toContain('שינויים מוסתרים')
      await wrapper.find('#batch-club-filter').setValue('אחר')
      await wrapper.find('input[aria-label="כתובת — קבוצה 3"]').setValue('אולם')
      await wrapper.find('#batch-club-filter').setValue('גוש')
      expect(wrapper.text()).toContain('1 שינויים מוסתרים')
      await wrapper.find('#batch-club-filter').setValue('__all__')
      expect(wrapper.text()).not.toContain('שינויים מוסתרים')
    })

    it('does not count an edited row that was removed as hidden', async () => {
      const { wrapper } = await mountView(mixed())
      await wrapper.find('#batch-club-filter').setValue('גוש')
      await wrapper.find('input[aria-label="כתובת — קבוצה 1"]').setValue('אולם')
      await wrapper.find('button[aria-label="הסרה מהרשימה — קבוצה 1"]').trigger('click')
      expect(wrapper.text()).not.toContain('שינויים מוסתרים')
    })

    it('is hidden when no team has a club', async () => {
      const { wrapper } = await mountView([team(1)])
      expect(wrapper.find('#batch-club-filter').exists()).toBe(false)
    })

    it('has no "no club" option when every team has a club', async () => {
      const { wrapper } = await mountView([team(1, { club: 'גוש' })])
      expect(wrapper.find('#batch-club-filter option[value="__none__"]').exists()).toBe(false)
    })
  })
})
