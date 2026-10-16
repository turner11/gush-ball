import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SEG = 'https://ibasketball.co.il/league/'
const team = (id, name_en, league = null) => ({
  id,
  name: `קבוצה ${id}`,
  name_en,
  logo_url: null,
  ibasketball_league_url: league,
})
const league = (ibasketball_id, name, slug) => ({ ibasketball_id, name, url: `${SEG}${slug}/` })

const LEAGUES = [league(10, 'ליגת נערים א', '2026-7'), league(11, 'ליגת בוגרים', '2026-8'), league(12, 'ליגה ריקה', '2026-9')]

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const fail = { ok: false, status: 500, statusText: 'err', json: async () => ({}) }

function mockApi(teams, leagues) {
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams') return Promise.resolve(typeof teams === 'function' ? teams() : ok(teams))
    if (url === '/api/leagues') return Promise.resolve(typeof leagues === 'function' ? leagues() : ok(leagues))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

async function mountView() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/teams', name: 'teams', component: { template: '<div/>' } },
      { path: '/teams/:leagueId', name: 'league-teams', component: { template: '<div/>' } },
      { path: '/:slug', component: { template: '<div/>' } },
    ],
  })
  await router.push('/teams')
  const { default: TeamsView } = await import('./TeamsView.vue')
  const wrapper = mount(TeamsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const hrefs = (w) => w.findAll('a').map((a) => a.attributes('href'))
const button = (w, text) => w.findAll('button').find((b) => b.text() === text)

describe('TeamsView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('default view lists only leagues with our teams, with on-site counts', async () => {
    mockApi(
      [team(1, 'A', `${SEG}2026-7`), team(2, 'B', `${SEG}2026-7/`), team(3, 'C', `${SEG}2026-8/`)],
      LEAGUES,
    )
    const wrapper = await mountView()

    expect(hrefs(wrapper)).toEqual(['/teams/11', '/teams/10']) // alphabetical by league name
    const text = wrapper.text()
    expect(text).toContain('2 קבוצות באתר')
    expect(text).toContain('קבוצה אחת באתר')
    expect(text).not.toContain('ליגה ריקה')
  })

  it('our teams with a missing or unknown league URL appear under קבוצות נוספות', async () => {
    mockApi([team(1, 'A', `${SEG}2026-7/`), team(2, 'B'), team(3, 'C', `${SEG}gone/`)], LEAGUES)
    const wrapper = await mountView()

    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['ליגות', 'קבוצות נוספות'])
    expect(hrefs(wrapper)).toEqual(['/teams/10', '/b', '/c'])
  })

  it('כל הליגות lists every league and filters by name', async () => {
    mockApi([team(1, 'A', `${SEG}2026-7/`)], LEAGUES)
    const wrapper = await mountView()

    await button(wrapper, 'כל הליגות').trigger('click')
    await flushPromises()
    expect(button(wrapper, 'כל הליגות').attributes('aria-pressed')).toBe('true')
    expect(hrefs(wrapper)).toEqual(['/teams/12', '/teams/11', '/teams/10'])

    const search = wrapper.find('input[type="search"]')
    await search.setValue('נערים')
    await flushPromises()
    expect(hrefs(wrapper)).toEqual(['/teams/10'])

    await search.setValue('zzz')
    await flushPromises()
    expect(wrapper.text()).toContain('אין ליגות התואמות')
    await button(wrapper, 'נקה חיפוש').trigger('click')
    await flushPromises()
    expect(hrefs(wrapper)).toHaveLength(3)
  })

  it('shows an error with retry on failure', async () => {
    let calls = 0
    mockApi([team(1, 'A', `${SEG}2026-7/`)], () => (calls++ ? ok(LEAGUES) : fail))
    const wrapper = await mountView()

    expect(wrapper.find('[role="alert"]').text()).toBe('שגיאה בטעינת הליגות, נסה שוב')
    await button(wrapper, 'נסה שוב').trigger('click')
    await flushPromises()
    expect(hrefs(wrapper)).toEqual(['/teams/10'])
  })

  it('shows a skeleton while loading', async () => {
    mockApi(() => new Promise(() => {}), [])
    const wrapper = await mountView()
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
  })

  it('with leagues but no teams of ours, offers כל הליגות instead of a dead end', async () => {
    mockApi([], LEAGUES)
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('עדיין אין קבוצות באתר.')
    await button(wrapper, 'לכל הליגות').trigger('click')
    await flushPromises()
    expect(hrefs(wrapper)).toHaveLength(3)
  })

  it('with no leagues yet, every team shows and the mode control is hidden', async () => {
    localStorage.setItem('gush-ball:selected-team-id', '2')
    mockApi([team(1, 'A'), team(2, 'B')], [])
    const wrapper = await mountView()

    expect(hrefs(wrapper)).toEqual(['/a', '/b'])
    expect(wrapper.find('[role="group"]').exists()).toBe(false)
    expect(wrapper.findAll('a[aria-current="true"]').map((a) => a.attributes('href'))).toEqual(['/b'])
  })

  it('shows the empty state when there are no leagues and no teams', async () => {
    mockApi([], [])
    expect((await mountView()).text()).toContain('אין ליגות עדיין.')
  })
})
