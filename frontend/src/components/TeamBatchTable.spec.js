import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler(options))
  })
}

const row = (n) => ({
  name: `קבוצה ${n}`,
  initialName: `קבוצה ${n}`,
  name_en: '',
  ibasketball_team_url: `https://ibasketball.co.il/team/${n}-a/`,
  ibasketball_league_url: null,
  league_name: null,
  home_court_address: '',
  logo_url: null,
  primary_color: '#000000',
  secondary_color: '#000000',
  background: 'hoop-1',
  facebook_url: '',
  instagram_url: '',
  youtube_url: '',
  tiktok_url: '',
  twitter_url: '',
  admin_id: '',
  error: null,
})

const ADMINS = [{ id: 5, username: 'coach', team_ids: [9] }]

async function mountTable(rows, save) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:p(.*)*', component: { template: '<div/>' } },
      { path: '/admin/teams', name: 'admin-teams', component: { template: '<div/>' } },
    ],
  })
  const push = vi.spyOn(router, 'push')
  const { default: TeamBatchTable } = await import('./TeamBatchTable.vue')
  const data = ref(rows)
  const Harness = {
    components: { TeamBatchTable },
    setup: () => ({ data, save }),
    template: '<TeamBatchTable v-model:rows="data" submit-label="שמירה" :save="save" />',
  }
  const wrapper = mount(Harness, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, push }
}

describe('TeamBatchTable', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('links to the team page on ibasketball in a new tab', async () => {
    mockFetch({ 'GET /api/teams/assignable-users': () => res([]) })
    const { wrapper } = await mountTable([row(1)], vi.fn())
    const link = wrapper.find('a[href="https://ibasketball.co.il/team/1-a/"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('assigns the picked admin after saving and removes the row', async () => {
    mockFetch({
      'GET /api/teams/assignable-users': () => res(ADMINS),
      'PUT /api/teams/7/admins/5': () => res(null, 204),
    })
    const save = vi.fn(async () => 7)
    const { wrapper, push } = await mountTable([row(1)], save)
    const select = wrapper.find('select[aria-label="מנהל — קבוצה 1"]')
    expect(select.text()).toContain('coach')
    await select.setValue(5)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/teams/7/admins/5', expect.objectContaining({ method: 'PUT' }))
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(push).toHaveBeenCalledWith({ name: 'admin-teams' })
  })

  it('assigns the same admin to two teams', async () => {
    mockFetch({
      'GET /api/teams/assignable-users': () => res(ADMINS),
      'PUT /api/teams/7/admins/5': () => res(null, 204),
      'PUT /api/teams/8/admins/5': () => res(null, 204),
    })
    let next = 7
    const save = vi.fn(async () => next++)
    const { wrapper } = await mountTable([row(1), row(2)], save)
    await wrapper.find('select[aria-label="מנהל — קבוצה 1"]').setValue(5)
    await wrapper.find('select[aria-label="מנהל — קבוצה 2"]').setValue(5)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(2)
    expect(global.fetch).toHaveBeenCalledWith('/api/teams/7/admins/5', expect.objectContaining({ method: 'PUT' }))
    expect(global.fetch).toHaveBeenCalledWith('/api/teams/8/admins/5', expect.objectContaining({ method: 'PUT' }))
  })

  it('still saves when the admin list fails to load', async () => {
    mockFetch({ 'GET /api/teams/assignable-users': () => res({ detail: 'boom' }, 500) })
    const save = vi.fn(async () => 7)
    const { wrapper, push } = await mountTable([row(1)], save)
    expect(wrapper.text()).toContain('לא ניתן לטעון מנהלים')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ name: 'admin-teams' })
  })
})
