import { flushPromises, mount } from '@vue/test-utils'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.vue'
import { useAuth } from './composables/useAuth'
import { useSelectedTeam } from './composables/useSelectedTeam'
import router from './router'

// IS 5568 = WCAG 2.0 A/AA. One axe pass per public route, plus the heading rules axe leaves out.
const TEAM = { id: 1, name: 'קבוצה א', name_en: 'Team A', club: 'מכבי', ibasketball_league_url: 'https://x.il/league/a/', primary_color: null, secondary_color: null }
const CLUB = { id: 5, name: 'מכבי', name_en: 'Maccabi', ibasketball_url: null, about_title: null, about: null, about_images: [], about_links: [], officials: [] }
const PLAYER = { id: 1, team_id: 1, name: 'יוסי כהן', jersey_number: 7, images: [{ id: 1, url: '/p.jpg' }], videos: [], is_coach: false }
const GAME = {
  id: 1, team_id: 1, is_home: true, scheduled_at: '2020-05-01T18:00:00', status: 'final', has_stats: false,
  team_score: 80, opponent_score: 70, description: 'משחק גמר', scorers: [], videos: [], images: [],
  opponent: { id: 6, name: 'הפועל עבר', logo_url: null, source_url: null, address: null },
}
const POST = { id: 1, title: 'ניצחון', body: 'תוכן', pinned: false, created_at: '2020-05-02T10:00:00' }
const IMAGE = { id: 1, title: '', url: '/i.jpg', player_ids: [1], hidden_from_home: false }
const VIDEO = { id: 1, title: 'הדגשים', url: 'https://youtu.be/dQw4w9WgXcQ', player_ids: [1] }

const BODIES = {
  '/api/teams': [TEAM],
  '/api/clubs': [CLUB],
  '/api/leagues': [],
  '/api/standings': [],
  '/api/teams/1': TEAM,
  '/api/teams/1/links': [],
  '/api/teams/1/videos': [VIDEO],
  '/api/teams/1/images': [IMAGE],
  '/api/teams/1/posts': [POST],
  '/api/teams/1/players': [PLAYER],
  '/api/teams/1/games': [GAME],
  '/api/teams/1/games/scorers': [],
  '/api/teams/1/games/1': GAME,
  '/api/teams/1/practices': [],
  '/api/players/1': PLAYER,
  '/api/games': [GAME],
}
const json = (status, body) => ({ ok: status < 400, status, statusText: String(status), json: async () => body })

function mockFetch(failing = []) {
  global.fetch = vi.fn((url) => {
    const path = String(url).split('?')[0]
    if (path === '/api/auth/me') return Promise.resolve(json(401, { detail: 'x' }))
    if (failing.includes(path)) return Promise.resolve(json(500, { detail: 'x' }))
    if (!(path in BODIES)) return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    return Promise.resolve(json(200, BODIES[path]))
  })
}

async function mountAt(path) {
  useSelectedTeam().selectedTeamId.value = '1'
  useAuth().checked.value = false
  await router.push(path)
  const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const headingLevels = () => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]))

describe('accessibility (IS 5568 AA)', () => {
  let wrapper
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.clear()
    document.head.insertAdjacentHTML('beforeend', '<link rel="icon" href="/logo.jpg">') // the layout swaps it
  })
  afterEach(() => {
    wrapper?.unmount()
    document.head.querySelector('link[rel="icon"]')?.remove()
    vi.restoreAllMocks()
  })

  it.each([
    '/accessibility',
    '/team_a',
    '/team_a/schedule',
    '/team_a/games/1',
    '/team_a/standings',
    '/team_a/roster',
    '/team_a/posts',
    '/team_a/media',
    '/players/1',
    '/clubs/maccabi',
    '/teams',
    '/admin/login',
    '/admin/signup',
  ])('%s has no axe A/AA violations and a sound heading outline', async (path) => {
    mockFetch()
    wrapper = await mountAt(path)

    const { violations } = await axe.run(document.body, {
      iframes: false, // ponytail: jsdom can't message into the YouTube embeds; frame-title still checks the iframe tag
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: false } }, // ponytail: jsdom has no layout; contrast is checked by hand
    })
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])

    expect(document.querySelectorAll('h1')).toHaveLength(1)
    const levels = headingLevels()
    levels.forEach((level, i) => expect(level - (levels[i - 1] ?? 0), `heading order ${levels}`).toBeLessThanOrEqual(1))
  })

  it.each([
    ['/team_a/games/1', '/api/teams/1/games/1'],
    ['/players/1', '/api/players/1'],
    ['/clubs/maccabi', '/api/clubs'],
  ])('%s keeps exactly one h1 when its load fails', async (path, failing) => {
    mockFetch([failing])
    wrapper = await mountAt(path)

    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })
})
