import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuth } from '../composables/useAuth'
import PlayerView from './PlayerView.vue'

const PLAYER = {
  id: 3,
  team_id: 1,
  name: 'יוסי כהן',
  jersey_number: 7,
  images: [{ id: 1, url: '/a.jpg' }, { id: 2, url: '/b.jpg' }],
  videos: [],
}

const ROSTER = [
  { id: 2, name: 'אבי לוי', jersey_number: 4, images: [] },
  PLAYER,
  { id: 4, name: 'רון שמש', jersey_number: 9, images: [] },
]

// Team media: only items tagged with player 3 belong on the page.
const RESPONSES = {
  '/api/players/3': PLAYER,
  '/api/teams/1/players': ROSTER,
  '/api/teams/1': { id: 1, name: 'קבוצה א', name_en: 'Team A' },
  '/api/teams/1/games/scorers': [],
  '/api/teams/1/images': [
    { id: 10, title: 'אימון', url: '/t1.jpg', player_ids: [3] },
    { id: 11, title: 'אחר', url: '/other.jpg', player_ids: [4] },
    { id: 12, title: 'גמר', url: '/t2.jpg', player_ids: [4, 3] },
  ],
  '/api/teams/1/videos': [
    { id: 20, title: 'הסל המנצח', url: 'https://example.com/v', player_ids: [3] },
    { id: 21, title: 'לא שלו', url: 'https://example.com/w', player_ids: [] },
  ],
}
const okFetch = () =>
  vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: async () => RESPONSES[url] }))

async function mountAt(path, options = {}) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/players/:id', component: PlayerView },
      { path: '/teams', name: 'teams', component: { template: '<div/>' } },
      { path: '/:slug/roster', name: 'roster', component: { template: '<div/>' } },
      { path: '/:slug/admin/players', name: 'admin-players', component: { template: '<div/>' } },
      { path: '/:slug', name: 'team-home', component: { template: '<div/>' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(PlayerView, { global: { plugins: [router] }, ...options })
  await flushPromises()
  return wrapper
}

const withPlayer = (overrides) => {
  const base = okFetch()
  global.fetch = vi.fn((url) =>
    url === '/api/players/3' ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ...PLAYER, ...overrides }) }) : base(url),
  )
}

describe('PlayerView', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a coach shows מאמן instead of a jersey number', async () => {
    withPlayer({ is_coach: true, jersey_number: null })
    const wrapper = await mountAt('/players/3')
    expect(wrapper.text()).toContain('מאמן')
    expect(wrapper.text()).not.toContain('#7')
  })

  it('shows birth date and age when present', async () => {
    withPlayer({ birth_date: '2008-03-12', age: 18 })
    const wrapper = await mountAt('/players/3')
    expect(wrapper.text()).toContain('12.03.2008')
    expect(wrapper.text()).toContain('גיל 18')
  })

  it('shows only "גיל: מתחת 16" for a minor', async () => {
    withPlayer({ minor: true, birth_date: null, age: null })
    const wrapper = await mountAt('/players/3')
    expect(wrapper.text()).toContain('גיל: מתחת 16')
    expect(wrapper.text()).not.toContain('תאריך לידה')
  })

  it('admin viewing a minor still sees only "מתחת 16"', async () => {
    withPlayer({ minor: true, birth_date: '2014-03-12', age: 12 })
    const wrapper = await mountAt('/players/3')
    expect(wrapper.text()).toContain('מתחת 16')
    expect(wrapper.text()).not.toContain('12.03.2014')
    expect(wrapper.text()).not.toContain('גיל 12')
  })

  it('renders nothing about birth date when null', async () => {
    withPlayer({})
    const wrapper = await mountAt('/players/3')
    expect(wrapper.text()).not.toContain('תאריך לידה')
  })

  it("hero avatar shows the player's first own photo with its face focus", async () => {
    withPlayer({ images: [{ id: 1, url: '/a.jpg', focus_x: 50, focus_y: 40.5, zoom: 1.5 }] })
    const avatar = (await mountAt('/players/3')).find('[data-testid="player-avatar"]')

    expect(avatar.attributes('src')).toBe('/a.jpg')
    expect(avatar.attributes('style')).toContain('object-position: 50% 40.5%')
    expect(avatar.attributes('style')).toContain('transform: scale(1.5)')
  })

  it('hero avatar falls back to the default photo when the player has none', async () => {
    withPlayer({ images: [] })
    const avatar = (await mountAt('/players/3')).find('[data-testid="player-avatar"]')

    expect(avatar.attributes('src')).toBe('/default-player.png')
    expect(avatar.attributes('style')).toBeUndefined()
  })

  it('shows personal videos before tagged team videos', async () => {
    withPlayer({ videos: [{ id: 20, title: 'הדגשים שלי', url: 'https://youtu.be/dQw4w9WgXcQ' }] })
    const text = (await mountAt('/players/3')).text()

    expect(text).toContain('הדגשים שלי')
    expect(text).toContain('הסל המנצח')
    expect(text).not.toContain('לא שלו')
    expect(text.indexOf('הדגשים שלי')).toBeLessThan(text.indexOf('הסל המנצח'))
  })

  it('shows the jersey number large, outside the heading, and omits it when unset', async () => {
    global.fetch = okFetch()
    const withNumber = await mountAt('/players/3')
    expect(withNumber.find('header').text()).toContain('#7')
    expect(withNumber.find('h1').text()).not.toContain('#')

    withPlayer({ jersey_number: null })
    expect((await mountAt('/players/3')).find('header').text()).not.toContain('#')
  })

  it('photos block has a "תמונות" h2 like the other sections', async () => {
    global.fetch = okFetch()
    const wrapper = await mountAt('/players/3')
    expect(wrapper.findAll('h2').map((h) => h.text())).toContain('תמונות')
  })

  it('links the team name and logo to the team hub', async () => {
    global.fetch = okFetch()
    const link = (await mountAt('/players/3')).findAll('a').find((a) => a.text() === 'קבוצה א')

    expect(link.attributes('href')).toBe('/team_a')
    expect(link.find('img').attributes('src')).toBe('/logo.jpg')
  })

  it("shows the player's own images, then team images they're tagged in (newest first)", async () => {
    global.fetch = okFetch()
    const wrapper = await mountAt('/players/3')

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.findAll('ul img').map((i) => i.attributes('src'))).toEqual([
      '/a.jpg',
      '/b.jpg',
      '/t2.jpg',
      '/t1.jpg',
    ])
  })

  it("a tagged team image without a title uses the player's name as alt", async () => {
    global.fetch = vi.fn((url) =>
      Promise.resolve({ ok: true, status: 200, json: async () => (url === '/api/teams/1/images' ? [{ id: 10, title: '', url: '/t1.jpg', player_ids: [3] }] : RESPONSES[url]) }),
    )
    const wrapper = await mountAt('/players/3')

    expect(wrapper.find('img[src="/t1.jpg"]').attributes('alt')).toBe('יוסי כהן')
    expect(wrapper.find('button[aria-label="הגדלת תמונה: יוסי כהן"] img[src="/t1.jpg"]').exists()).toBe(true)
  })

  describe('teammate nav (#384)', () => {
    const NAV = 'nav[aria-label="ניווט בין שחקני הקבוצה"]'
    const links = async (id) => {
      const base = okFetch()
      global.fetch = vi.fn((url) => {
        const p = ROSTER.find((r) => url === `/api/players/${r.id}`)
        return p ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ...p, team_id: 1, videos: [] }) }) : base(url)
      })
      return (await mountAt(`/players/${id}`)).findAll(`${NAV} a`)
    }

    it.each([
      [2, ['/players/3'], 'השחקן הבא'],
      [3, ['/players/2', '/players/4'], 'השחקן הקודם'],
      [4, ['/players/3'], 'השחקן הקודם'],
    ])('player %i links to its neighbours in roster order', async (id, hrefs, firstLabel) => {
      const a = await links(id)

      expect(a.map((l) => l.attributes('href'))).toEqual(hrefs)
      expect(a[0].attributes('aria-label')).toMatch(new RegExp('^' + firstLabel))
    })

    it('is hidden when the team has a single player', async () => {
      const base = okFetch()
      global.fetch = vi.fn((url) =>
        url === '/api/teams/1/players' ? Promise.resolve({ ok: true, status: 200, json: async () => [PLAYER] }) : base(url),
      )

      expect((await mountAt('/players/3')).find(NAV).exists()).toBe(false)
    })
  })

  describe('photo lightbox (#383)', () => {
    let wrapper
    afterEach(() => {
      wrapper?.unmount()
      document.documentElement.dir = ''
    })
    const open = async (index) => {
      global.fetch = okFetch()
      wrapper = await mountAt('/players/3', { attachTo: document.body })
      const thumb = wrapper.findAll('ul button')[index]
      await thumb.trigger('click')
      return thumb
    }
    const shown = () => wrapper.find('dialog img').attributes('src')

    it('clicking a photo opens it full-size in a modal dialog', async () => {
      await open(1)

      expect(wrapper.find('dialog').element.open).toBe(true)
      expect(shown()).toBe('/b.jpg')
      expect(wrapper.find('dialog img').classes()).toContain('object-contain')
      expect(wrapper.findAll('ul button')[0].attributes('aria-label')).toContain('יוסי כהן')
    })

    it('next/prev cycle through all photos and wrap', async () => {
      await open(3)
      expect(shown()).toBe('/t1.jpg')
      await wrapper.find('[aria-label="התמונה הבאה"]').trigger('click')
      expect(shown()).toBe('/a.jpg')
      await wrapper.find('[aria-label="התמונה הקודמת"]').trigger('click')
      expect(shown()).toBe('/t1.jpg')
    })

    it('arrow keys are direction-aware (RTL: ArrowLeft = next)', async () => {
      document.documentElement.dir = 'rtl'
      await open(0)
      await wrapper.find('dialog').trigger('keydown', { key: 'ArrowLeft' })
      expect(shown()).toBe('/b.jpg')
      await wrapper.find('dialog').trigger('keydown', { key: 'ArrowRight' })
      expect(shown()).toBe('/a.jpg')
    })

    it('Esc (native close) clears the lightbox and returns focus to the clicked thumbnail', async () => {
      const thumb = await open(1)
      wrapper.find('dialog').element.close()
      await flushPromises()

      expect(wrapper.find('dialog img').exists()).toBe(false)
      expect(wrapper.find('dialog').element.open).toBe(false)
      expect(document.activeElement).toBe(thumb.element)
    })
  })

  it('shows the English name, sets the title and Person JSON-LD', async () => {
    const fetchMock = okFetch()
    global.fetch = vi.fn((url) => (url === '/api/players/3' ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ...PLAYER, name_en: 'Yossi Cohen' }) }) : fetchMock(url)))
    const wrapper = await mountAt('/players/3')

    expect(wrapper.find('bdi[lang="en"]').text()).toBe('Yossi Cohen')
    expect(wrapper.text()).toContain('כל השחקנים של קבוצה א')
    expect(document.title).toBe('יוסי כהן · קבוצה א · Yossi Cohen · כדורסל')
    const ld = JSON.parse(document.head.querySelector('script[data-page]').textContent)
    expect(ld['@type']).toBe('Person')
    expect(ld.alternateName).toBe('Yossi Cohen')
    expect(ld.memberOf.url).toMatch(/\/team_a$/)
    expect(ld.image).toBe('/a.jpg')
  })

  it.each([
    ['succeeds', (base, url) => base(url)],
    ['fails', () => ({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) })],
  ])('ignores a stale load that %s after the user navigates to another player', async (_, staleResult) => {
    const base = okFetch()
    let release
    let held = 0
    const gate = new Promise((r) => (release = r))
    const player4 = { ...PLAYER, id: 4, name: 'דני לוי' }
    global.fetch = vi.fn((url) => {
      if (url === '/api/players/4') return Promise.resolve({ ok: true, status: 200, json: async () => player4 })
      if (url === '/api/teams/1/videos' && !held++) return gate.then(() => staleResult(base, url)) // holds only player 3's load open
      return base(url)
    })
    const wrapper = await mountAt('/players/3')
    await wrapper.vm.$router.push('/players/4')
    await flushPromises() // player 4 finished first
    release()
    await flushPromises()

    expect(document.title).toContain('דני לוי')
    expect(JSON.parse(document.head.querySelector('script[data-page]').textContent).name).toBe('דני לוי')
    expect(wrapper.text()).toContain('דני לוי')
  })

  it('shows only the videos the player is tagged in', async () => {
    global.fetch = okFetch()
    const text = (await mountAt('/players/3')).text()

    expect(text).toContain('הסל המנצח')
    expect(text).not.toContain('לא שלו')
  })

  it('tells not-found apart from a failed load', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }))
    document.head.querySelectorAll('script[data-page]').forEach((el) => el.remove())
    expect((await mountAt('/players/9')).text()).toContain('השחקן לא נמצא')
    expect(document.head.querySelector('script[data-page]')).toBeNull()
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) }))
    const wrapper = await mountAt('/players/3')
    expect(wrapper.find('[role="alert"]').text()).toContain('שגיאה בטעינת השחקן')
    global.fetch = okFetch()
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('h1').exists()).toBe(true)
  })

  it('"כל השחקנים" links to the player own team roster', async () => {
    global.fetch = okFetch()
    const wrapper = await mountAt('/players/3')

    const link = wrapper.findAll('a').find((a) => a.text().includes('כל השחקנים'))
    expect(link.attributes('href')).toBe('/1/roster')
  })

  describe('self-edit (#329)', () => {
    const signIn = async (me, overrides = {}) => {
      const fetchMock = okFetch()
      global.fetch = vi.fn((url, options) =>
        url in overrides
          ? Promise.resolve({ ok: true, status: 200, json: async () => overrides[url] })
          : url === '/api/auth/me'
          ? me
            ? Promise.resolve({ ok: true, status: 200, json: async () => me })
            : Promise.resolve({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) })
          : fetchMock(url, options),
      )
      await useAuth().checkSession()
    }

    it('shows the edit entry only for the linked user', async () => {
      await signIn({ username: 'a', player_ids: [3] })
      expect((await mountAt('/players/3')).text()).toContain('עריכת הפרופיל שלי')
      await signIn({ username: 'a', player_ids: [4] })
      expect((await mountAt('/players/3')).text()).not.toContain('עריכת הפרופיל שלי')
      await signIn(null)
      expect((await mountAt('/players/3')).text()).not.toContain('עריכת הפרופיל שלי')
    })

    // Empty needs the player's own media and the tagged team media gone.
    const EMPTY = { '/api/players/3': { ...PLAYER, images: [], videos: [] }, '/api/teams/1/images': [], '/api/teams/1/videos': [] }
    const buttonNamed = (wrapper, text) => wrapper.findAll('button').find((b) => b.text() === text)

    it("the owner's empty photos and videos prompt opens the editor (#385)", async () => {
      await signIn({ username: 'a', player_ids: [3] }, EMPTY)
      const wrapper = await mountAt('/players/3')
      expect(buttonNamed(wrapper, 'הוספת סרטון')).toBeTruthy()
      await buttonNamed(wrapper, 'הוספת תמונות').trigger('click')
      expect(wrapper.find('#profile-form').exists()).toBe(true)
      expect(buttonNamed(wrapper, 'עריכת הפרופיל שלי').attributes('aria-expanded')).toBe('true')
      expect(buttonNamed(wrapper, 'הוספת תמונות')).toBeUndefined()
    })

    it('visitors get a muted line, no upload prompt (#385)', async () => {
      for (const me of [{ username: 'a', player_ids: [4], team_ids: [] }, null]) {
        await signIn(me, EMPTY)
        const wrapper = await mountAt('/players/3')
        expect(wrapper.findAll('h2').map((h) => h.text())).toContain('תמונות')
        expect(wrapper.text()).toContain('אין תמונות עדיין')
        expect(buttonNamed(wrapper, 'הוספת תמונות')).toBeUndefined()
        expect(buttonNamed(wrapper, 'הוספת סרטון')).toBeUndefined()
        expect(wrapper.find('.empty-state').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('סרטונים')
      }
    })

    it('saving sends only the name fields and updates the heading', async () => {
      await signIn({ username: 'a', player_ids: [3] })
      const wrapper = await mountAt('/players/3')
      const base = global.fetch
      global.fetch = vi.fn((url, options) =>
        options?.method === 'PATCH'
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ...PLAYER, name: 'חדש' }) })
          : base(url, options),
      )
      await wrapper.findAll('button').find((b) => b.text().includes('עריכת הפרופיל שלי')).trigger('click')
      await wrapper.find('#profile-name').setValue('חדש')
      await wrapper.find('form').trigger('submit')
      await flushPromises()

      const [url, options] = global.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH')
      expect(url).toBe('/api/teams/1/players/3')
      expect(JSON.parse(options.body)).toEqual({ name: 'חדש', name_en: null })
      expect(wrapper.find('h1').text()).toContain('חדש')
    })
  })

  describe('team admin edit (#468)', () => {
    const edit = (w) => w.findAll('button').find((b) => b.text() === 'עריכת מדיה')

    it('team admin gets a manage link to /1/admin/players?edit=3 and a media-only inline form', async () => {
      global.fetch = okFetch()
      useAuth().user.value = { username: 'a', team_ids: [1], player_ids: [] }
      const wrapper = await mountAt('/players/3')
      expect(wrapper.findAll('a').find((a) => a.text() === 'ניהול שחקן').attributes('href')).toBe('/1/admin/players?edit=3')
      await edit(wrapper).trigger('click')
      expect(wrapper.find('#profile-form').exists()).toBe(true)
      expect(wrapper.find('#profile-name').exists()).toBe(false)
      expect(wrapper.text()).toContain('תמונות')
      expect(wrapper.text()).toContain('סרטונים')
    })

    it('preview hides the manage link', async () => {
      global.fetch = okFetch()
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'member'
      useAuth().user.value = { username: 'a', team_ids: [1], player_ids: [] }
      expect((await mountAt('/players/3')).text()).not.toContain('ניהול שחקן')
      previewMode.value = null
    })

    it("preview hides the admin edit but keeps a linked player's own edit", async () => {
      global.fetch = okFetch()
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'member'
      useAuth().user.value = { username: 'a', team_ids: [1], player_ids: [] }
      expect(edit(await mountAt('/players/3'))).toBeUndefined()
      useAuth().user.value = { username: 'a', team_ids: [1], player_ids: [3] }
      expect((await mountAt('/players/3')).text()).toContain('עריכת הפרופיל שלי')
      previewMode.value = null
    })

    it("anonymous preview hides a linked player's own edit", async () => {
      global.fetch = okFetch()
      const { previewMode } = await import('../composables/useAuth')
      previewMode.value = 'anonymous'
      useAuth().user.value = { username: 'a', team_ids: [], player_ids: [3] }
      expect((await mountAt('/players/3')).text()).not.toContain('עריכת הפרופיל שלי')
      previewMode.value = null
    })
  })

  const row = (game_id, day, player_id, points) => ({
    game_id, scheduled_at: `2026-03-${day}T18:00:00`, opponent_name: `יריבה ${game_id}`, player_id, name: 'x', jersey_number: 1, points,
  })
  const withScorers = (rows) => {
    const base = okFetch()
    global.fetch = vi.fn((url) =>
      url === '/api/teams/1/games/scorers' ? Promise.resolve({ ok: true, status: 200, json: async () => rows }) : base(url),
    )
  }

  it('1 game shows stat tiles (1 / points / avg) and no chart', async () => {
    withScorers([row(1, '01', 3, 12), row(1, '01', 4, 30)])
    const wrapper = await mountAt('/players/3')
    expect(wrapper.findAll('.stat-value').map((v) => v.text())).toEqual(['1', '12', '12.0'])
    expect(wrapper.find('svg[role=img]').exists()).toBe(false)
  })

  it('2+ games shows the scoring chart', async () => {
    withScorers([row(1, '01', 3, 12), row(2, '08', 3, 7), row(2, '08', 4, 30)])
    const wrapper = await mountAt('/players/3')
    expect(wrapper.findAll('.stat-value').map((v) => v.text())).toEqual(['2', '19', '9.5'])
    expect(wrapper.findAll('svg[role=img] polyline')).toHaveLength(1)
  })

  it('0 games hides the statistics section', async () => {
    withScorers([row(1, '01', 4, 30)])
    const wrapper = await mountAt('/players/3')
    expect(wrapper.find('.stat-value').exists()).toBe(false)
  })
})
