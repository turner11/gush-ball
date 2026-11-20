import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEAM = { id: 1, name: 'קבוצה א', name_en: 'Team A', logo_url: null, home_court_address: null, ibasketball_team_url: null }
const GAME = {
  id: 5,
  team_id: 1,
  is_home: false,
  scheduled_at: '2020-05-01T18:00:00',
  status: 'final',
  has_stats: false,
  team_score: 80,
  opponent_score: 70,
  description: 'משחק גמר מרגש',
  scorers: [],
  images: [],
  opponent: { id: 6, name: 'הפועל עבר', logo_url: null, source_url: null, address: 'רחוב הספורט 1, חיפה' },
}

function mockFetch(game, posts = []) { // posts null = the posts endpoint fails
  global.fetch = vi.fn((url) => {
    if (url === '/api/teams/1') return Promise.resolve({ ok: true, status: 200, json: async () => TEAM })
    if (url === '/api/teams/1/games/5') return Promise.resolve(game)
    if (url === '/api/teams/1/games' || url === '/api/standings') return Promise.resolve(ok([]))
    if (url === '/api/teams/1/games/5/opponent-results') return Promise.resolve(ok([]))
    if (url === '/api/teams/1/players') return Promise.resolve(ok([]))
    if (url === '/api/teams/1/posts') return Promise.resolve(posts ? ok(posts) : { ok: false, status: 500, statusText: 'Error', json: async () => ({}) })
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountAt(teamsLoaded, teamId = '1', path = '/team_a/games/5', beforeMount = null) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:slug/games/:id', name: 'game', component: { template: '<div/>' } },
      { path: '/:slug/schedule', name: 'schedule', component: { template: '<div/>' } },
      { path: '/players/:id', name: 'player', component: { template: '<div/>' } },
      { path: '/:slug/admin/players', name: 'admin-players', component: { template: '<div/>' } },
      { path: '/:slug/stats', name: 'stats', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  beforeMount?.()
  const { useSelectedTeam } = await import('../composables/useSelectedTeam')
  const sel = useSelectedTeam()
  sel.selectedTeamId.value = teamId
  sel.teamsLoaded.value = teamsLoaded
  const { default: GameView } = await import('./GameView.vue')
  const wrapper = mount(GameView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, sel, router }
}

const MEMBER = { id: 1, team_ids: [], member_team_ids: [1] }
const ADMIN = { id: 1, team_ids: [1], member_team_ids: [1] }
async function memberUser(user = MEMBER) {
  const auth = await import('../composables/useAuth')
  auth.useAuth().user.value = user
  auth.previewMode.value = null
}

describe('GameView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = '' // mountAt attaches to the body; drop stale #post-N cards between tests
  })

  it('shows the not-found state with a schedule link when no team resolves', async () => {
    mockFetch(ok(GAME))
    const { wrapper } = await mountAt(true, null)
    expect(wrapper.find('[aria-busy]').exists()).toBe(false)
    expect(wrapper.text()).toContain('המשחק לא נמצא.')
    expect(wrapper.find('a').attributes('href')).toBe('/team_a/schedule')
  })

  it('renders a played game: scoreboard, date, venue and description', async () => {
    mockFetch(ok(GAME))
    const { wrapper } = await mountAt(true)
    const text = wrapper.text()
    expect(text).toContain('הפועל עבר')
    expect(text).toContain('70 : 80')
    expect(text).toContain('ממוצעי נקודות')
    expect(text).toContain('משחק גמר מרגש')
    expect(wrapper.find('a[href*="google.com/maps"]').exists()).toBe(true)
  })

  it('shows not-found for a 404 game', async () => {
    mockFetch({ ok: false, status: 404, json: async () => ({}) })
    const { wrapper } = await mountAt(true)
    expect(wrapper.text()).toContain('המשחק לא נמצא.')
    expect(wrapper.find('a[href="/team_a/schedule"]').exists()).toBe(true)
  })

  it('waits for the team list before fetching', async () => {
    mockFetch(ok(GAME))
    const { wrapper, sel } = await mountAt(false)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(wrapper.find('[aria-busy=true]').exists()).toBe(true)
    sel.teamsLoaded.value = true
    await flushPromises()
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/teams/1/games/5')
  })

  describe('scorers', () => {
    const SCORERS = [
      { player_id: 11, name: 'אלף', jersey_number: 7, points: 22 },
      { player_id: 12, name: 'בית', jersey_number: null, points: 10 },
    ]
    const withScorers = { ...GAME, scorers: SCORERS }

    it('lists scorers, highest first, with links to player pages', async () => {
      mockFetch(ok(withScorers))
      const { wrapper } = await mountAt(true)
      const rows = wrapper.findAll('ol li')
      expect(rows).toHaveLength(2)
      expect(rows[0].text()).toContain('אלף')
      expect(rows[0].text()).toContain('22')
      expect(rows[0].find('a').attributes('href')).toBe('/players/11')
    })

    it('hides the scorers card from visitors when there are none', async () => {
      mockFetch(ok(GAME))
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('קלעים')
    })

    it('team admin can open the scorers editor', async () => {
      mockFetch(ok(withScorers))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameScorersEditor } = await import('../components/GameScorersEditor.vue')
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(false)
      await wrapper.findAll('button').find((b) => b.text() === 'עריכת קלעים').trigger('click')
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'סיום עריכה')).toBe(true)
      wrapper.findComponent(GameScorersEditor).vm.$emit('saved', [])
      await flushPromises()
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(false)
    })

    it('announces the save after the editor closes', async () => {
      mockFetch(ok(withScorers))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameScorersEditor } = await import('../components/GameScorersEditor.vue')
      const note = () => wrapper.get('[data-test="scorers-saved"]')
      expect(note().text()).toBe('')
      const toggle = () => wrapper.findAll('button').find((b) => b.text() === 'עריכת קלעים')
      await toggle().trigger('click')
      wrapper.findComponent(GameScorersEditor).vm.$emit('saved', [])
      await flushPromises()
      expect(wrapper.findComponent(GameScorersEditor).exists()).toBe(false)
      expect(note().text()).toBe('הקלעים נשמרו')
      await toggle().trigger('click')
      expect(note().text()).toBe('')
    })

    it('non-admin sees no edit button', async () => {
      mockFetch(ok(withScorers))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 2, team_ids: [] }
      const { wrapper } = await mountAt(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'עריכת קלעים')).toBe(false)
      expect(wrapper.find('[data-test="scorers-saved"]').exists()).toBe(false)
    })
  })

  describe('media', () => {
    const withMedia = {
      ...GAME,
      images: [{ url: 'https://cdn.example.com/a.jpg', title: 'חגיגה', title_en: null }],
    }

    it('renders the game images', async () => {
      mockFetch(ok(withMedia))
      const { wrapper } = await mountAt(true)
      expect(wrapper.find('iframe').exists()).toBe(false)
      expect(wrapper.find('img[src="https://cdn.example.com/a.jpg"]').attributes('alt')).toBe('חגיגה')
    })

    it('(media) clicking an image opens the in-page viewer', async () => {
      mockFetch(ok(withMedia))
      const { wrapper } = await mountAt(true)
      await wrapper.get('button[aria-label="הגדלת תמונה: חגיגה"]').trigger('click')
      expect(wrapper.get('dialog').attributes('open')).toBeDefined()
      expect(wrapper.get('dialog img').attributes('src')).toBe('https://cdn.example.com/a.jpg')
    })

    it('shows an admin with no images the empty state', async () => {
      mockFetch(ok(GAME))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).toContain('עדיין לא נוספו תמונות.')
    })

    it('hides the media card from visitors when both lists are empty', async () => {
      mockFetch(ok(GAME))
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('מדיה')
    })

    it('team admin can open the media editor', async () => {
      mockFetch(ok(withMedia))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameMediaEditor } = await import('../components/GameMediaEditor.vue')
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(false)
      await wrapper.findAll('button').find((b) => b.text() === 'עריכת מדיה').trigger('click')
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'סיום עריכה')).toBe(true)
      wrapper.findComponent(GameMediaEditor).vm.$emit('saved', { images: [] })
      await flushPromises()
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(false)
    })

    it('announces the save after the editor closes', async () => {
      mockFetch(ok(withMedia))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const { wrapper } = await mountAt(true)
      const { default: GameMediaEditor } = await import('../components/GameMediaEditor.vue')
      const note = () => wrapper.get('[data-test="media-saved"]')
      expect(note().text()).toBe('')
      const toggle = () => wrapper.findAll('button').find((b) => b.text() === 'עריכת מדיה')
      await toggle().trigger('click')
      wrapper.findComponent(GameMediaEditor).vm.$emit('saved', { images: [] })
      await flushPromises()
      expect(wrapper.findComponent(GameMediaEditor).exists()).toBe(false)
      expect(note().text()).toBe('המדיה נשמרה')
      await toggle().trigger('click')
      expect(note().text()).toBe('')
    })

    it('non-admin sees no edit button', async () => {
      mockFetch(ok(withMedia))
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 2, team_ids: [] }
      const { wrapper } = await mountAt(true)
      expect(wrapper.findAll('button').some((b) => b.text() === 'עריכת מדיה')).toBe(false)
      expect(wrapper.find('[data-test="media-saved"]').exists()).toBe(false)
    })
  })

  describe('linked posts (#581)', () => {
    const post = (id, title, game_id) => ({ id, title, body: 'b', game_id })
    const h2s = (w) => w.findAll('h2').map((h) => h.text())

    it('shows the posts linked to this game, not other posts', async () => {
      mockFetch(ok(GAME), [post(1, 'לקראת המשחק', 5), post(2, 'פוסט אחר', 99), post(3, 'כללי', null)])
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).toContain('לקראת המשחק')
      expect(wrapper.text()).not.toContain('פוסט אחר')
      expect(wrapper.text()).not.toContain('כללי')
      expect(wrapper.findAll('article')).toHaveLength(1)
    })

    it('hides the posts section when no post is linked to the game', async () => {
      mockFetch(ok(GAME), [post(2, 'פוסט אחר', 99)])
      const { wrapper } = await mountAt(true)
      expect(h2s(wrapper)).not.toContain('עדכונים')
    })

    it('a failed posts fetch hides the section but keeps the game page', async () => {
      mockFetch(ok(GAME), null)
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).toContain('הפועל עבר')
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(h2s(wrapper)).not.toContain('עדכונים')
    })

    it('scrolls to the #post-<id> card once the game has loaded (#584)', async () => {
      mockFetch(ok(GAME), [post(1, 'לקראת המשחק', 5)])
      Element.prototype.scrollIntoView ??= () => {} // jsdom lacks it; spyOn needs it to exist
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
      const { wrapper } = await mountAt(true, '1', '/team_a/games/5#post-1')
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.contexts[0].id).toBe('post-1')
      wrapper.unmount()
    })
  })

  it('a failed load shows an error with retry, not not-found', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) }))
    const { wrapper } = await mountAt(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('שגיאה בטעינת המשחק')
    expect(wrapper.text()).not.toContain('המשחק לא נמצא')
    mockFetch(ok(GAME))
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('הפועל עבר')
  })

  it('orders the sections: about, posts, highlights, scorers, stats, averages, briefing, media (#673)', async () => {
    mockFetch(ok({
      ...GAME,
      highlights: [{ title: 'שלשה', text: null, urls: [] }],
      briefing: [{ title: 'פתיחה', text: null, urls: [] }],
      scorers: [{ player_id: 11, name: 'אלף', jersey_number: 7, points: 22 }],
      images: [{ url: 'https://cdn.example.com/a.jpg', title: null, title_en: null }],
    }), [{ id: 1, title: 'לקראת המשחק', body: 'b', game_id: 5 }])
    await memberUser(ADMIN)
    const { wrapper } = await mountAt(true)
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual([
      'על המשחק', 'עדכונים', 'היילייטס', 'קלעים', 'סטטיסטיקת חמישיות', 'ממוצעי נקודות', 'תדריך וידאו', 'מדיה',
    ])
    expect(wrapper.get('#game-posts-title').classes()).toContain('sr-only')
  })

  describe('highlights (#665)', () => {
    const HL = [{ title: 'שלשה', text: 'מהפינה', urls: ['https://www.youtube.com/watch?v=abc123&t=5&end=9'] }]
    const heads = (wrapper) => wrapper.findAll('h2').map((h) => h.text())
    const buttons = (wrapper) => wrapper.findAll('button').map((b) => b.text())

    it('shows highlights to anonymous visitors', async () => {
      mockFetch(ok({ ...GAME, highlights: HL }))
      const { wrapper } = await mountAt(true)
      expect(heads(wrapper)).toContain('היילייטס')
      expect(wrapper.get('iframe').attributes('src')).toContain('start=5&end=9')
      expect(wrapper.text()).toContain('שלשה')
      expect(wrapper.text()).toContain('מהפינה')
      expect(buttons(wrapper)).not.toContain('עריכת היילייטס')
    })

    it('hides an empty highlights section from fans but shows it to editors', async () => {
      mockFetch(ok({ ...GAME, highlights: [] }))
      const fan = await mountAt(true)
      expect(heads(fan.wrapper)).not.toContain('היילייטס')
      fan.wrapper.unmount()

      await memberUser(ADMIN)
      const { wrapper } = await mountAt(true)
      expect(heads(wrapper)).toContain('היילייטס')
      expect(wrapper.text()).toContain('עדיין אין היילייטס למשחק.')
      expect(buttons(wrapper)).toContain('עריכת היילייטס')
    })

    it('saves highlights from the inline editor', async () => {
      mockFetch(ok({ ...GAME, highlights: [] }))
      const base = global.fetch
      global.fetch = vi.fn((url, opts) =>
        url === '/api/teams/1/games/5/highlights' ? Promise.resolve(ok(HL)) : base(url, opts),
      )
      await memberUser(ADMIN)
      const { wrapper } = await mountAt(true)
      await wrapper.findAll('button').find((b) => b.text() === 'עריכת היילייטס').trigger('click')
      await wrapper.get('[data-test="add-item"]').trigger('click')
      await wrapper.get('#highlights-title-0').setValue('שלשה')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      const put = global.fetch.mock.calls.find((c) => c[1]?.method === 'PUT')
      expect(put[0]).toBe('/api/teams/1/games/5/highlights')
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.text()).toContain('שלשה')
      expect(wrapper.get('[data-test="highlights-saved"]').text()).toBe('ההיילייטס נשמרו')
    })
  })

  describe('video briefing (#658)', () => {
    const ITEMS = [
      { title: 'קליפ פתיחה', text: 'שימו לב לחסימה', urls: ['https://www.youtube.com/watch?v=abc123&t=90&end=120'] },
      { title: 'הערות כלליות', text: 'טקסט חופשי', urls: [] },
    ]

    it('hides the briefing from non-members and in the anonymous preview', async () => {
      mockFetch(ok({ ...GAME, briefing: null }))
      const first = await mountAt(true)
      expect(first.wrapper.text()).not.toContain('תדריך וידאו')
      first.wrapper.unmount()

      mockFetch(ok({ ...GAME, briefing: ITEMS }))
      await memberUser()
      ;(await import('../composables/useAuth')).previewMode.value = 'anonymous'
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('תדריך וידאו')
    })

    it('shows a member the items in order, a video item as an embed with its clip', async () => {
      mockFetch(ok({ ...GAME, briefing: ITEMS }))
      await memberUser()
      const { wrapper } = await mountAt(true)
      const text = wrapper.text()
      expect(text.indexOf('קליפ פתיחה')).toBeLessThan(text.indexOf('הערות כלליות'))
      expect(wrapper.get('iframe').attributes('src')).toContain('start=90&end=120')
      expect(text).toContain('שימו לב לחסימה')
      expect(text).toContain('טקסט חופשי')
    })

    it('multi-video item shows a grid and enlarges the played video', async () => {
      const urls = ['https://youtu.be/a?t=1&end=2', 'https://youtu.be/b']
      mockFetch(ok({ ...GAME, briefing: [{ title: 'דוגמאות', text: null, urls }] }))
      await memberUser()
      const { wrapper } = await mountAt(true)
      const cells = wrapper.findAll('[data-video-key]')
      expect(cells).toHaveLength(2)
      expect(wrapper.findAll('iframe')).toHaveLength(2)
      expect(wrapper.text()).not.toContain('דוגמה')
      expect(wrapper.findAll('[data-video-key] h4')).toHaveLength(0)
      expect(cells[1].get('iframe').attributes('title')).toBe('דוגמאות 2')

      cells[1].get('iframe').element.focus()
      window.dispatchEvent(new Event('blur'))
      await flushPromises()
      expect(cells[1].classes()).toContain('sm:col-span-full')
      expect(cells[0].classes()).not.toContain('sm:col-span-full')
    })

    it('enlarges the second video when focus moves iframe to iframe without another blur', async () => {
      vi.useFakeTimers()
      try {
        const urls = ['https://youtu.be/a', 'https://youtu.be/b']
        mockFetch(ok({ ...GAME, briefing: [{ title: 'דוגמאות', text: null, urls }] }))
        await memberUser()
        const { wrapper } = await mountAt(true)
        const cells = wrapper.findAll('[data-video-key]')

        cells[0].get('iframe').element.focus()
        window.dispatchEvent(new Event('blur'))
        await flushPromises()
        expect(cells[0].classes()).toContain('sm:col-span-full')

        cells[1].get('iframe').element.focus()
        await vi.advanceTimersByTimeAsync(300)
        expect(cells[1].classes()).toContain('sm:col-span-full')
        expect(cells[0].classes()).not.toContain('sm:col-span-full')
        wrapper.unmount()
      } finally {
        vi.useRealTimers()
      }
    })

    it('remembers a collapsed briefing across a reload', async () => {
      mockFetch(ok({ ...GAME, briefing: ITEMS }))
      await memberUser()
      const first = await mountAt(true)
      const details = first.wrapper.get('details')
      expect(details.element.open).toBe(true)
      details.element.open = false
      await details.trigger('toggle')
      expect(localStorage.getItem('gush-ball:briefing-closed:5')).toBe('1')
      first.wrapper.unmount()

      vi.resetModules()
      mockFetch(ok({ ...GAME, briefing: ITEMS }))
      await memberUser()
      const second = await mountAt(true)
      const again = second.wrapper.get('details')
      expect(again.element.open).toBe(false)
      again.element.open = true
      await again.trigger('toggle')
      expect(localStorage.getItem('gush-ball:briefing-closed:5')).toBeNull()
    })

    it('restores the saved scroll position after the game loads', async () => {
      mockFetch(ok({ ...GAME, briefing: ITEMS }))
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const scroll = { left: 0, top: 500 }
      await mountAt(true, '1', '/team_a/games/5', () => history.replaceState({ ...history.state, scroll }, ''))
      expect(scrollTo).toHaveBeenCalledWith(scroll)
    })

    it('an admin sees the empty state and the edit button; a plain member sees no card', async () => {
      mockFetch(ok({ ...GAME, briefing: [], can_edit_briefing: true }))
      await memberUser(ADMIN)
      const admin = await mountAt(true)
      expect(admin.wrapper.text()).toContain('עדיין אין תדריך למשחק.')
      expect(admin.wrapper.findAll('button').map((b) => b.text())).toContain('עריכת תדריך')
      admin.wrapper.unmount()

      mockFetch(ok({ ...GAME, briefing: [] }))
      await memberUser(MEMBER)
      const { wrapper } = await mountAt(true)
      expect(wrapper.text()).not.toContain('תדריך וידאו')
    })

    it('a team coach (a member the server lets edit) gets the briefing edit button only (#670)', async () => {
      mockFetch(ok({ ...GAME, briefing: [], highlights: [], can_edit_briefing: true }))
      await memberUser(MEMBER)
      const { wrapper } = await mountAt(true)
      const labels = wrapper.findAll('button').map((b) => b.text())
      expect(labels).toContain('עריכת תדריך')
      expect(labels).not.toContain('עריכת קלעים')
      wrapper.unmount()

      ;(await import('../composables/useAuth')).previewMode.value = 'member'
      const preview = await mountAt(true)
      expect(preview.wrapper.findAll('button').map((b) => b.text())).not.toContain('עריכת תדריך')
    })
  })

  it('preview hides the scorers and media edit buttons from a team admin (#468)', async () => {
    mockFetch(ok({ ...GAME, scorers: [{ player_id: 2, name: 'x', points: 2 }], images: [{ url: '/a.jpg', title: null, title_en: null }] }))
    const { useAuth, previewMode } = await import('../composables/useAuth')
    useAuth().user.value = { id: 1, team_ids: [1] }
    previewMode.value = 'member'
    const { wrapper } = await mountAt(true)
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).not.toContain('עריכת קלעים')
    expect(labels).not.toContain('עריכת מדיה')
    expect(labels).not.toContain('ניהול סטטיסטיקה')
  })

  describe('stats manager (#591)', () => {
    const adminClick = async (wrapper, text) => {
      await wrapper.findAll('button').find((b) => b.text() === text).trigger('click')
      await flushPromises()
    }

    let rowsOnServer = []
    async function mountAdmin(game, patch = (body) => ok({ ...game, stats_url: body.stats_url })) {
      mockFetch(ok(game))
      const base = global.fetch
      global.fetch = vi.fn((url, opts) => {
        if (url === '/api/teams/1/games/5' && opts?.method === 'PATCH') return Promise.resolve(patch(JSON.parse(opts.body)))
        if (url === '/api/teams/1/games/5/stats/rows') {
          if (opts?.method === 'PUT') return Promise.resolve(ok({ stats_url: null, snapshots: 1 }))
          return Promise.resolve(ok(rowsOnServer))
        }
        if (url === '/api/teams/1/games/5/stats') {
          if (opts?.method === 'DELETE') return Promise.resolve({ ok: true, status: 204, json: async () => null })
          return Promise.resolve(ok({ snapshots: 3, stats_url: 'https://sheet' }))
        }
        return base(url, opts)
      })
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      return mountAt(true)
    }

    it('a team admin can load stats from the game page', async () => {
      const { wrapper } = await mountAdmin(GAME)
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.find('#stats-url').setValue('https://sheet')
      await adminClick(wrapper, 'טעינת סטטיסטיקה')
      const post = global.fetch.mock.calls.find(([u, o]) => u === '/api/teams/1/games/5/stats' && o?.method === 'POST')
      expect(JSON.parse(post[1].body)).toEqual({ url: 'https://sheet' })
      expect(wrapper.text()).toContain('נטענו 3 רשומות')
      expect(wrapper.find('a[href*="stats"]').exists()).toBe(true)
    })

    it('a team admin can delete stats from the game page', async () => {
      const { wrapper } = await mountAdmin({ ...GAME, has_stats: true, stats_url: 'https://sheet' })
      expect(wrapper.find('a[href*="stats"]').exists()).toBe(true)
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await adminClick(wrapper, 'מחיקת סטטיסטיקה')
      await adminClick(wrapper, 'מחיקה')
      expect(global.fetch.mock.calls.some(([u, o]) => u === '/api/teams/1/games/5/stats' && o?.method === 'DELETE')).toBe(true)
      expect(wrapper.find('a[href*="stats"]').exists()).toBe(false)
    })

    const patches = () => global.fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH')

    it('ending the edit saves a changed sheet link without loading stats (#596)', async () => {
      const { wrapper } = await mountAdmin(GAME)
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.find('#stats-url').setValue('abc')
      await adminClick(wrapper, 'סיום עריכה')
      expect(patches()).toHaveLength(1)
      expect(JSON.parse(patches()[0][1].body)).toEqual({ stats_url: 'abc' })
      expect(global.fetch.mock.calls.some(([u]) => u === '/api/teams/1/games/5/stats')).toBe(false)
      expect(wrapper.find('#game-stats-editor').exists()).toBe(false)
      expect(wrapper.get('[data-test="stats-saved"]').text()).toContain('הקישור לגיליון נשמר')
    })

    it('a double-click on end-edit sends one PATCH and leaves the editor closed (#596)', async () => {
      const { wrapper } = await mountAdmin(GAME)
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.find('#stats-url').setValue('https://other-sheet')
      const end = wrapper.findAll('button').find((b) => b.text() === 'סיום עריכה')
      end.trigger('click')
      await end.trigger('click')
      await flushPromises()
      expect(patches()).toHaveLength(1)
      expect(wrapper.find('#game-stats-editor').exists()).toBe(false)
    })

    it('clearing the link says it was removed (#596)', async () => {
      const { wrapper } = await mountAdmin({ ...GAME, stats_url: 'https://sheet' }, () => ok({ ...GAME, stats_url: null }))
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.find('#stats-url').setValue('')
      await adminClick(wrapper, 'סיום עריכה')
      expect(wrapper.get('[data-test="stats-saved"]').text()).toContain('הקישור לגיליון הוסר')
    })

    it('ending the edit with an unchanged link sends no PATCH (#596)', async () => {
      const { wrapper } = await mountAdmin({ ...GAME, stats_url: 'https://sheet' })
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await adminClick(wrapper, 'סיום עריכה')
      expect(patches()).toHaveLength(0)
      expect(wrapper.find('#game-stats-editor').exists()).toBe(false)
    })

    it('ending the edit saves unsaved stats rows (#601)', async () => {
      rowsOnServer = [['1', '2', '3', '4', '5', '0', '0', '1', '10:00']]
      const { wrapper } = await mountAdmin(GAME)
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.get('[aria-label="שורה 1, זמן נותר"]').setValue('9:00')
      await adminClick(wrapper, 'סיום עריכה')
      rowsOnServer = []
      const put = global.fetch.mock.calls.find(([u, o]) => u === '/api/teams/1/games/5/stats/rows' && o?.method === 'PUT')
      expect(JSON.parse(put[1].body)[0][8]).toBe('9:00')
    })

    it('a rejected sheet link keeps the editor open with the error (#596)', async () => {
      const detail = 'Not a Google Sheet link or sheet ID: x'
      const { wrapper } = await mountAdmin(GAME, () => ({ ok: false, status: 422, json: async () => ({ detail }) }))
      await adminClick(wrapper, 'ניהול סטטיסטיקה')
      await wrapper.find('#stats-url').setValue('x')
      await adminClick(wrapper, 'סיום עריכה')
      expect(wrapper.find('#game-stats-editor').exists()).toBe(true)
      expect(wrapper.get('[role="alert"]').text()).toContain(detail)
    })
  })
})
