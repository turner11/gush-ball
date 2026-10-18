import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAMS = [
  { id: 1, name: 'קבוצה א', name_en: 'Team A', ibasketball_league_url: 'https://x.il/league/a' },
  { id: 2, name: 'קבוצה ב', name_en: 'Team B', ibasketball_league_url: 'https://x.il/league/b' },
  { id: 3, name: 'קבוצה ג', name_en: 'Team C', ibasketball_league_url: 'https://x.il/league/b' },
]
const LEAGUES = [
  { ibasketball_id: 1, name: 'ליגה א', url: 'https://x.il/league/a' },
  { ibasketball_id: 2, name: 'ליגה ב', url: 'https://x.il/league/b' },
]

describe('AdminTeamPicker', () => {
  let router

  beforeEach(async () => {
    vi.resetModules()
    router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/:slug/admin/players', name: 'p', component: { template: '<div />' } }],
    })
    await router.push('/team_a/admin/players')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  async function mountPicker(leagues = LEAGUES) {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => leagues }))
    const { default: AdminTeamPicker } = await import('./AdminTeamPicker.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    useSelectedTeam().selectedTeamId.value = '1'
    const wrapper = mount(AdminTeamPicker, { props: { teams: TEAMS }, global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return wrapper
  }
  const box = (wrapper, id) => wrapper.findAllComponents({ name: 'FilterCombobox' }).find((c) => c.props('id') === id)

  it('team options narrow to the chosen league', async () => {
    const wrapper = await mountPicker()
    expect(box(wrapper, 'team-select').props('options')).toHaveLength(3)
    box(wrapper, 'league-filter').vm.$emit('update:modelValue', '2')
    await flushPromises()
    expect(box(wrapper, 'team-select').props('options').map((o) => o.value)).toEqual(['team_b', 'team_c'])
  })

  it("picking a league without the current team navigates to that league's first team", async () => {
    const wrapper = await mountPicker()
    box(wrapper, 'league-filter').vm.$emit('update:modelValue', '2')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/team_b/admin/players')
  })

  it('picking a team navigates to its slug', async () => {
    const wrapper = await mountPicker()
    box(wrapper, 'team-select').vm.$emit('update:modelValue', 'team_c')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/team_c/admin/players')
  })

  it('hides the league picker with fewer than two leagues', async () => {
    const wrapper = await mountPicker([LEAGUES[0]])
    expect(box(wrapper, 'league-filter')).toBeUndefined()
    expect(box(wrapper, 'team-select')).toBeDefined()
  })
})
