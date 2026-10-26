import { flushPromises, mount } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VIDEOS = [
  { id: 1, title: 'ישן', url: 'https://youtu.be/v1' },
  { id: 3, title: 'חדש', url: 'https://youtu.be/v3' },
  { id: 2, title: 'אמצע', url: 'https://youtu.be/v2' },
]
const IMAGES = [
  { id: 1, title: 'תמונה חדשה', url: 'https://img/a.jpg' },
  { id: 2, title: 'תמונה ישנה', url: 'https://img/b.jpg' },
]

function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body }
}

async function mountView({ videos = VIDEOS, images = IMAGES, query = {} } = {}) {
  const data = { videos, images, players: [] }
  global.fetch = vi.fn((url) => {
    const kind = String(url).split('/').pop()
    if (!(kind in data)) return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    return Promise.resolve(jsonRes(data[kind]))
  })
  const { default: MediaView } = await import('./MediaView.vue')
  const wrapper = mount(MediaView, { global: { provide: { [routeLocationKey]: { query } } } })
  await flushPromises()
  return wrapper
}

async function openTab(wrapper, label) {
  const trigger = wrapper.findAll('[role="tab"]').find((t) => t.text() === label)
  await trigger.trigger('mousedown', { button: 0 })
  await flushPromises()
}

describe('MediaView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders images first, then videos', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual(['תמונות', 'סרטונים'])
  })

  it('opens on the videos tab for ?tab=videos', async () => {
    const wrapper = await mountView({ query: { tab: 'videos' } })
    expect(wrapper.find('[role="tab"][data-state="active"]').text()).toBe('סרטונים')
  })

  it('shows an inline error with retry when the load fails, and retrying loads the page', async () => {
    let failing = true
    global.fetch = vi.fn((url) => {
      const kind = String(url).split('/').pop()
      if (failing) return Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
      return Promise.resolve(jsonRes({ videos: VIDEOS, images: IMAGES }[kind]))
    })
    const { default: MediaView } = await import('./MediaView.vue')
    const wrapper = mount(MediaView)
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('[role="tab"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('משהו השתבש')
    failing = false
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('תמונה חדשה')
  })

  it('renders the tabs root right-to-left', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[dir]').attributes('dir')).toBe('rtl')
  })

  it('shows videos newest first on the videos tab', async () => {
    const wrapper = await mountView()
    await openTab(wrapper, 'סרטונים')
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual(['חדש', 'אמצע', 'ישן'])
  })

  it('keeps the API order for images on the default tab and never fetches posts', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('img').map((i) => i.attributes('alt'))).toEqual(['תמונה חדשה', 'תמונה ישנה'])
    expect(global.fetch.mock.calls.map(([u]) => String(u)).some((u) => u.endsWith('/posts'))).toBe(false)
  })

  it('clicking an image opens the in-page viewer, not a new tab', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('a[target=_blank]').exists()).toBe(false)
    await wrapper.get('button[aria-label="הגדלת תמונה: תמונה חדשה"]').trigger('click')
    expect(wrapper.get('dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('dialog img').attributes('src')).toBe('https://img/a.jpg')
  })

  it('shows an empty state for a tab with no items', async () => {
    const wrapper = await mountView({ images: [] })
    expect(wrapper.find('.empty-state').text()).toBe('אין תמונות עדיין.')
  })

  it('ignores a late response for a team that is no longer selected', async () => {
    let resolveFirst
    const first = new Promise((r) => (resolveFirst = r))
    global.fetch = vi.fn((url) => {
      const [, , , team, kind] = String(url).split('/')
      if (team === '1') return kind === 'images' ? first : Promise.resolve(jsonRes([]))
      return Promise.resolve(jsonRes(kind === 'images' ? [{ id: 9, title: 'תמונת קבוצה ב', url: 'https://img/b2.jpg' }] : []))
    })
    const { default: MediaView } = await import('./MediaView.vue')
    const { useSelectedTeam } = await import('../composables/useSelectedTeam')
    const wrapper = mount(MediaView)
    await flushPromises()
    useSelectedTeam().selectedTeamId.value = '2'
    await flushPromises()
    resolveFirst(jsonRes(IMAGES))
    await flushPromises()

    expect(wrapper.text()).toContain('תמונת קבוצה ב')
    expect(wrapper.text()).not.toContain('תמונה חדשה')
  })

  describe('inline editing (#468)', () => {
    const editButton = (wrapper, text = 'עריכת מדיה') => wrapper.findAll('button').find((b) => b.text() === text)

    it('team admin edits media inline', async () => {
      const { useAuth } = await import('../composables/useAuth')
      useAuth().user.value = { id: 1, team_ids: [1] }
      const wrapper = await mountView()
      await editButton(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.findAll('button').some((b) => b.text() === 'הוספה')).toBe(true)

      global.fetch.mockClear()
      await editButton(wrapper, 'סיום עריכה').trigger('click')
      await flushPromises()
      expect(global.fetch.mock.calls.map(([u]) => u)).toContain('/api/teams/1/videos')
      expect(wrapper.findAll('button').some((b) => b.text() === 'הוספה')).toBe(false)
    })

    it('visitors and preview see no edit button', async () => {
      const { useAuth, previewMode } = await import('../composables/useAuth')
      const visitor = await mountView()
      expect(editButton(visitor)).toBeUndefined()

      useAuth().user.value = { id: 1, team_ids: [1] }
      previewMode.value = 'member'
      expect(editButton(await mountView())).toBeUndefined()
    })
  })
})
