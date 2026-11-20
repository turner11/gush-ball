import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

import { apiFetch } from '../lib/api'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

const SRC = 'https://www.youtube.com/watch?v=abcdefghijk'
const GAME = { id: 5, team_id: 1, opponent: { name: 'הפועל' }, can_edit_briefing: true, video_urls: [SRC] }
const PLAYERS = [
  { id: 11, name: 'אלף', jersey_number: 12, is_coach: false },
  { id: 12, name: 'מאמן', jersey_number: null, is_coach: true },
]

let clips
let created
function respond(game = GAME) {
  clips = []
  created = 100
  apiFetch.mockImplementation(async (path, opts = {}) => {
    if (path === '/teams/1') return { id: 1, name: 'גוש' }
    if (path === '/teams/1/games/5') return game
    if (path === '/teams/1/players') return PLAYERS
    if (path === '/teams/1/clips' && !opts.method) return clips
    if (path === '/teams/1/clips' && opts.method === 'POST') return { id: ++created, ...opts.body }
    if (opts.method === 'PATCH' || opts.method === 'DELETE') return null
    throw new Error(`Unhandled ${path}`)
  })
}
const calls = (method) => apiFetch.mock.calls.filter((c) => c[1]?.method === method)

async function mountStudio() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' } },
      { path: '/:slug/games/:id/studio', name: 'game-studio', component: { template: '<div/>' } },
    ],
  })
  router.push('/team_a/games/5/studio')
  await router.isReady()
  const { useSelectedTeam } = await import('../composables/useSelectedTeam')
  const sel = useSelectedTeam()
  sel.selectedTeamId.value = '1'
  sel.teamsLoaded.value = true
  const { default: GameStudioView } = await import('./GameStudioView.vue')
  const wrapper = mount(GameStudioView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const press = async (code, key = code, target = document.body) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }))
  await flushPromises()
}

describe('GameStudioView', () => {
  let wrapper
  beforeEach(() => {
    window.YT = {
      Player: class {
        getCurrentTime() { return 100 }
        getPlayerState() { return 2 }
        playVideo() {}
        pauseVideo() {}
        loadVideoById() {}
        seekTo() {}
        destroy() {}
      },
    }
    apiFetch.mockReset()
  })
  afterEach(() => {
    wrapper?.unmount()
    delete window.YT
  })

  it('shows the no-permission state when the server does not let the user edit briefings', async () => {
    respond({ ...GAME, can_edit_briefing: false })
    wrapper = await mountStudio()
    expect(wrapper.text()).toContain('הסטודיו פתוח למנהלי הקבוצה ולמאמן')
    expect(wrapper.find('iframe, [aria-keyshortcuts="M"]').exists()).toBe(false)
    await press('KeyM', 'm')
    expect(calls('POST')).toHaveLength(0)
  })

  it('M marks a moment 8s before to 3s after the current time', async () => {
    respond()
    wrapper = await mountStudio()
    await press('KeyM', 'm')
    expect(calls('POST')).toHaveLength(1)
    expect(calls('POST')[0][1].body).toMatchObject({ start: 92, end: 103, game_id: 5, source_url: SRC })
    expect(wrapper.get('[data-test="status"]').text()).toBe('נוסף קטע 1:32–1:43')
    expect(wrapper.findAll('ol button')).toHaveLength(1)
  })

  const SRC2 = 'https://www.youtube.com/watch?v=zzzzzzzzzzz'
  const stored = (id, source_url) => ({ id, game_id: 5, source_url, start: 1, end: 9, section: null, note: null, is_highlight: false, in_game_briefing: false, in_player_briefing: false, player_ids: [] })

  it('selects the newest clip after load, so the keys act on it', async () => {
    respond()
    clips.push(stored(1, SRC), stored(2, SRC))
    wrapper = await mountStudio()
    await press('KeyH', 'h')
    expect(calls('PATCH')[0][0]).toBe('/teams/1/clips/2')
  })

  it('I with a clip of another video selected starts a new clip instead of editing it', async () => {
    respond()
    clips.push(stored(1, SRC2)) // selected on load; the player shows SRC
    wrapper = await mountStudio()
    await press('KeyI', 'i')
    expect(calls('PATCH')).toHaveLength(0)
    expect(calls('POST')[0][1].body).toMatchObject({ source_url: SRC, start: 100 })
  })

  it('M typed in the section field does nothing', async () => {
    respond()
    wrapper = await mountStudio()
    await press('KeyM', 'm')
    const input = wrapper.get('#studio-section')
    await press('KeyM', 'm', input.element)
    expect(calls('POST')).toHaveLength(1)
  })

  it('digits then Enter tag the jersey, an unknown number says so', async () => {
    respond()
    wrapper = await mountStudio()
    await press('KeyM', 'm')
    await press('Digit1', '1')
    await press('Digit2', '2')
    expect(wrapper.text()).toContain('#12…')
    await press('Enter')
    expect(calls('PATCH').at(-1)[1].body.player_ids).toEqual([11])
    await press('Digit9', '9')
    await press('Enter')
    expect(wrapper.text()).toContain('אין שחקן עם מספר 9')
    await press('Escape')
    expect(wrapper.text()).not.toContain('אין שחקן עם מספר 9')
  })

  it('H toggles the highlight and saves the whole clip', async () => {
    respond()
    wrapper = await mountStudio()
    await press('KeyM', 'm')
    await press('KeyH', 'h')
    expect(calls('PATCH').at(-1)[1].body).toMatchObject({ is_highlight: true, game_id: 5, start: 92 })
    expect(wrapper.get('[aria-keyshortcuts="H"]').attributes('aria-pressed')).toBe('true')
  })

  it('Delete removes the clip, shows the undo toast and undo re-creates it', async () => {
    respond()
    wrapper = await mountStudio()
    await press('KeyM', 'm')
    await press('Delete')
    expect(calls('DELETE')[0][0]).toBe('/teams/1/clips/101')
    expect(wrapper.get('[role="status"]').text()).toContain('הקטע נמחק')
    expect(wrapper.findAll('ol button')).toHaveLength(0)
    await wrapper.findAll('button').find((b) => b.text() === 'ביטול').trigger('click')
    await flushPromises()
    expect(calls('POST')).toHaveLength(2)
    expect(wrapper.findAll('ol button')).toHaveLength(1)
  })
})
