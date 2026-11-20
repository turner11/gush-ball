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
let players
let created
let clipsError = null
function respond(game = GAME) {
  clipsError = null
  clips = []
  created = 100
  apiFetch.mockImplementation(async (path, opts = {}) => {
    if (path === '/teams/1') return { id: 1, name: 'גוש' }
    if (path === '/teams/1/games/5') return game
    if (path === '/teams/1/players') return PLAYERS
    if (path === '/teams/1/clips' && !opts.method) {
      if (clipsError) throw clipsError
      return clips
    }
    if (path === '/teams/1/clips' && opts.method === 'POST') return { id: ++created, ...opts.body }
    if (opts.method === 'PATCH' || opts.method === 'DELETE') return null
    throw new Error(`Unhandled ${path}`)
  })
}
const calls = (method) => apiFetch.mock.calls.filter((c) => c[1]?.method === method)

async function mountStudio(url = '/team_a/games/5/studio') {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' } },
      { path: '/:slug/games/:id/studio', name: 'game-studio', component: { template: '<div/>' } },
      { path: '/:slug/studio', name: 'team-studio', component: { template: '<div/>' } },
      { path: '/:slug', name: 'team-home', component: { template: '<div/>' } },
    ],
  })
  router.push(url)
  await router.isReady()
  const { useSelectedTeam } = await import('../composables/useSelectedTeam')
  const sel = useSelectedTeam()
  sel.selectedTeamId.value = '1'
  sel.teamsLoaded.value = true
  const { default: VideoStudioView } = await import('./VideoStudioView.vue')
  const wrapper = mount(VideoStudioView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const press = async (code, key = code, target = document.body) => {
  const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  await flushPromises()
  return event
}

describe('VideoStudioView', () => {
  let wrapper
  beforeEach(() => {
    localStorage.clear()
    players = []
    window.YT = {
      Player: class {
        constructor(_el, opts) {
          this.opts = opts
          this.seekTo = vi.fn()
          this.setPlaybackRate = vi.fn((r) => {
            this.rate = r
            this.opts.events.onPlaybackRateChange?.({ data: r })
          })
          players.push(this)
        }
        getCurrentTime() { return 100 }
        getPlayerState() { return 2 }
        getAvailablePlaybackRates() { return [0.5, 1, 1.5, 2] }
        getPlaybackRate() { return this.rate ?? 1 }
        playVideo() {}
        pauseVideo() {}
        loadVideoById() { this.rate = 1 } // YouTube resets the speed on a new video, without an event
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

  it('arrows seek 10s and comma/period 3s, without scrolling', async () => {
    respond()
    wrapper = await mountStudio()
    expect((await press('ArrowRight')).defaultPrevented).toBe(true)
    expect(players[0].seekTo).toHaveBeenLastCalledWith(110, true)
    await press('ArrowLeft')
    expect(players[0].seekTo).toHaveBeenLastCalledWith(90, true)
    await press('Comma', ',')
    expect(players[0].seekTo).toHaveBeenLastCalledWith(97, true)
  })

  it('= speeds up and - slows down, showing the rate', async () => {
    respond()
    wrapper = await mountStudio()
    await press('Equal', '=')
    expect(players[0].setPlaybackRate).toHaveBeenLastCalledWith(1.5)
    expect(wrapper.text()).toContain('×1.5')
    await press('Minus', '-')
    expect(players[0].setPlaybackRate).toHaveBeenLastCalledWith(1)
    expect(wrapper.text()).toContain('×1')
    expect(wrapper.text()).not.toContain('×1.5')
  })

  it('the speed badge goes back to ×1 when another video is loaded', async () => {
    respond({ ...GAME, video_urls: [SRC, 'https://www.youtube.com/watch?v=zzzzzzzzzzz'] })
    wrapper = await mountStudio()
    await press('Equal', '=')
    expect(wrapper.text()).toContain('×1.5')
    await wrapper.findAll('button').find((b) => b.text() === 'סרטון 2').trigger('click')
    expect(wrapper.text()).toContain('×1')
    expect(wrapper.text()).not.toContain('×1.5')
  })

  it('the larger-video toggle persists', async () => {
    respond()
    wrapper = await mountStudio()
    const toggle = () => wrapper.findAll('button').find((b) => b.text() === 'וידאו גדול')
    await toggle().trigger('click')
    expect(toggle().attributes('aria-pressed')).toBe('true')
    expect(JSON.parse(localStorage.getItem('gush-ball:studio')).theater).toBe(true)
    wrapper.unmount()
    wrapper = await mountStudio()
    expect(toggle().attributes('aria-pressed')).toBe('true')
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

  describe('team studio (#683)', () => {
    const gameless = (id, source_url = SRC) => ({ ...stored(id, source_url), game_id: null, in_player_briefing: true })
    const pasteUrl = async () => {
      await wrapper.get('#studio-url').setValue(SRC)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
    }

    it('lists only the game-less clips and offers only the P destination', async () => {
      respond()
      clips.push(stored(1, SRC), gameless(2))
      wrapper = await mountStudio('/team_a/studio')
      expect(wrapper.findAll('ol button')).toHaveLength(1)
      expect(wrapper.get('h1').text()).toBe('סטודיו וידאו')
      expect(wrapper.find('[aria-keyshortcuts="P"]').exists()).toBe(true)
      expect(wrapper.find('[aria-keyshortcuts="H"]').exists()).toBe(false)
      expect(wrapper.find('[aria-keyshortcuts="B"]').exists()).toBe(false)
      await press('KeyH', 'h')
      expect(calls('PATCH')).toHaveLength(0)
    })

    it('M after pasting a link POSTs a game-less P clip', async () => {
      respond()
      wrapper = await mountStudio('/team_a/studio')
      await pasteUrl()
      await press('KeyM', 'm')
      expect(calls('POST')[0][1].body).toMatchObject({ game_id: null, in_player_briefing: true, source_url: SRC })
    })

    it('shows the no-permission state when the clips list is forbidden', async () => {
      respond()
      clipsError = { status: 403 }
      wrapper = await mountStudio('/team_a/studio')
      expect(wrapper.text()).toContain('הסטודיו פתוח למנהלי הקבוצה ולמאמן')
    })

    it('the game studio links to the team studio', async () => {
      respond()
      wrapper = await mountStudio()
      expect(wrapper.text()).toContain('סטודיו קבוצתי')
    })
  })

  describe('shortcuts panel and moment window (#683)', () => {
    it('? opens the panel, the button closes it, and a new visit finds it open', async () => {
      respond()
      wrapper = await mountStudio()
      expect(wrapper.find('#studio-shortcuts').exists()).toBe(false)
      await press('Slash', '?')
      expect(wrapper.find('#studio-shortcuts').exists()).toBe(true)
      expect(wrapper.get('[aria-controls="studio-shortcuts"]').attributes('aria-expanded')).toBe('true')
      wrapper.unmount()
      wrapper = await mountStudio()
      expect(wrapper.find('#studio-shortcuts').exists()).toBe(true)
      await wrapper.get('[aria-controls="studio-shortcuts"]').trigger('click')
      expect(wrapper.find('#studio-shortcuts').exists()).toBe(false)
    })

    it('the edited window sets what M marks', async () => {
      respond()
      wrapper = await mountStudio()
      await press('Slash', '?')
      await wrapper.get('#studio-before').setValue(5)
      await wrapper.get('#studio-after').setValue(2)
      await press('KeyM', 'm')
      expect(calls('POST')[0][1].body).toMatchObject({ start: 95, end: 102 })
    })

    it('still works with storage blocked, using 8/3', async () => {
      respond()
      const spies = ['getItem', 'setItem'].map((m) => vi.spyOn(Storage.prototype, m).mockImplementation(() => { throw new Error('blocked') }))
      wrapper = await mountStudio()
      await press('KeyM', 'm')
      expect(calls('POST')[0][1].body).toMatchObject({ start: 92, end: 103 })
      spies.forEach((s) => s.mockRestore())
    })
  })
})
