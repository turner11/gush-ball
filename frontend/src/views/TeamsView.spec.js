import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const team = (id, name_en, club = null, logo_url = null) => ({ id, name: `קבוצה ${id}`, name_en, club, logo_url })

function mockTeams(res) {
  global.fetch = vi.fn((url) => {
    if (url !== '/api/teams') return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    return Promise.resolve(res)
  })
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/:slug', component: { template: '<div/>' } }],
  })
  const { default: TeamsView } = await import('./TeamsView.vue')
  const wrapper = mount(TeamsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('TeamsView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('links each team to its slug page with logo and name', async () => {
    mockTeams(ok([team(1, 'Team A', null, 'https://cdn.example.com/a.png'), team(2, 'Team B')]))
    const wrapper = await mountView()

    const links = wrapper.findAll('a')
    expect(links.map((a) => a.attributes('href'))).toEqual(['/team_a', '/team_b'])
    expect(links[0].text()).toContain('קבוצה 1')
    expect(links[0].find('img').attributes('src')).toBe('https://cdn.example.com/a.png')
    expect(links[1].find('img').attributes('src')).toBe('/logo.jpg')
  })

  it('groups teams under club headings, ungrouped last', async () => {
    mockTeams(ok([team(1, 'A', 'גוש'), team(2, 'B'), team(3, 'C', 'אליצור'), team(4, 'D', 'גוש')]))
    const wrapper = await mountView()

    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['גוש', 'אליצור', 'קבוצות נוספות'])
    const sections = wrapper.findAll('section')
    expect(sections.map((s) => s.findAll('a').map((a) => a.attributes('href')))).toEqual([
      ['/a', '/d'],
      ['/c'],
      ['/b'],
    ])
  })

  it('shows the club heading even with a single club, but no heading when no team has a club', async () => {
    mockTeams(ok([team(1, 'A', 'גוש'), team(2, 'B', 'גוש')]))
    expect((await mountView()).findAll('h2').map((h) => h.text())).toEqual(['גוש'])

    vi.resetModules()
    mockTeams(ok([team(1, 'A'), team(2, 'B')]))
    const wrapper = await mountView()
    expect(wrapper.findAll('h2')).toHaveLength(0)
    expect(wrapper.findAll('a')).toHaveLength(2)
  })

  it('filters teams by name, English name and club as you type', async () => {
    mockTeams(ok([team(1, 'Alpha', 'גוש'), team(2, 'Beta', 'אליצור'), team(3, 'Gamma')]))
    const wrapper = await mountView()
    const search = wrapper.find('input[type="search"]')
    const hrefs = () => wrapper.findAll('a').map((a) => a.attributes('href'))

    await search.setValue('  ALPHA ')
    expect(hrefs()).toEqual(['/alpha'])
    await search.setValue('2')
    expect(hrefs()).toEqual(['/beta'])
    await search.setValue('אליצור')
    expect(hrefs()).toEqual(['/beta'])
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['אליצור'])
  })

  it('shows a no-matches state and clears the search', async () => {
    mockTeams(ok([team(1, 'Alpha'), team(2, 'Beta')]))
    const wrapper = await mountView()
    const search = wrapper.find('input[type="search"]')

    await search.setValue('zzz')
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).toContain('אין קבוצות התואמות')

    await wrapper.findAll('button').find((b) => b.text() === 'נקה חיפוש').trigger('click')
    expect(search.element.value).toBe('')
    expect(wrapper.findAll('a')).toHaveLength(2)
  })

  it('hides the search until teams load', async () => {
    mockTeams(ok([]))
    expect((await mountView()).find('input[type="search"]').exists()).toBe(false)
  })

  it('marks the remembered team', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '2')
    mockTeams(ok([team(1, 'A'), team(2, 'B')]))
    const wrapper = await mountView()

    const current = wrapper.findAll('a[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].attributes('href')).toBe('/b')
  })

  it('shows the empty state when there are no teams', async () => {
    mockTeams(ok([]))
    expect((await mountView()).text()).toContain('אין קבוצות עדיין.')
  })

  it('shows an alert when loading fails', async () => {
    mockTeams({ ok: false, status: 500, statusText: 'err', json: async () => ({}) })
    const wrapper = await mountView()

    expect(wrapper.find('[role="alert"]').text()).toBe('שגיאה בטעינת הקבוצות, נסה שוב')
    expect(wrapper.text()).not.toContain('אין קבוצות עדיין.')
  })
})
