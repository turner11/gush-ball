import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRoute = vi.hoisted(() => ({ hash: '' }))
vi.mock('vue-router', async (orig) => ({ ...(await orig()), useRoute: () => mockRoute }))

const POSTS = [
  { id: 1, title: 'נעוץ א', body: 'גוף נעוץ', pinned: true },
  { id: 2, title: 'חדש ב', body: 'גוף חדש', pinned: false },
]

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountView(posts = POSTS) {
  global.fetch = vi.fn((url) => Promise.resolve(jsonRes(url.endsWith('/games') ? [] : posts)))
  const { default: PostsView } = await import('./PostsView.vue')
  const wrapper = mount(PostsView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('PostsView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('keeps the API order and badges pinned posts', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('h1').text()).toBe('עדכונים')
    expect(wrapper.findAll('article h2').map((h) => h.text())).toEqual(['נעוץ א', 'חדש ב'])
    const articles = wrapper.findAll('article')
    expect(articles[0].text()).toContain('נעוץ')
    expect(articles[1].find('.badge').exists()).toBe(false)
    expect(global.fetch.mock.calls.map(([u]) => u)).toEqual(['/api/teams/1/posts'])
  })

  it('renders the post body as markdown', async () => {
    const wrapper = await mountView([{ id: 1, title: 'כותרת', body: '**חשוב**', pinned: false }])
    expect(wrapper.find('article strong').text()).toBe('חשוב')
  })

  it('scrolls to the #post-<id> card once the posts have loaded', async () => {
    mockRoute.hash = '#post-2'
    Element.prototype.scrollIntoView ??= () => {} // jsdom lacks it; spyOn needs it to exist
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const wrapper = await mountView()
    mockRoute.hash = ''
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0].id).toBe('post-2')
    wrapper.unmount()
  })

  it('shows a muted <time> date only when created_at is set', async () => {
    const wrapper = await mountView([
      { id: 1, title: 'א', body: 'x', created_at: '2026-03-05T10:00:00Z' },
      { id: 2, title: 'ב', body: 'x', created_at: null },
    ])
    const [dated, legacy] = wrapper.findAll('article')
    expect(dated.find('time').attributes('datetime')).toBe('2026-03-05T10:00:00Z')
    expect(dated.find('time').classes()).toContain('text-muted')
    expect(legacy.find('time').exists()).toBe(false)
  })

  it('shows the side image only when image_url is set', async () => {
    const wrapper = await mountView([
      { id: 1, title: 'א', body: 'x', image_url: 'https://cdn/x.jpg' },
      { id: 2, title: 'ב', body: 'x', image_url: null },
    ])
    const [withImage, without] = wrapper.findAll('article')
    const img = withImage.find('img')
    expect(img.attributes('src')).toBe('https://cdn/x.jpg')
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('loading')).toBe('lazy')
    expect(without.find('img').exists()).toBe(false)
  })

  it('shows an empty state', async () => {
    expect((await mountView([])).find('.empty-state').text()).toBe('אין עדכונים עדיין.')
  })

  it('shows an error with retry, and retrying loads the posts', async () => {
    let failing = true
    global.fetch = vi.fn(() => Promise.resolve(failing ? { ok: false, status: 500, json: async () => ({}) } : jsonRes(POSTS)))
    const { default: PostsView } = await import('./PostsView.vue')
    const wrapper = mount(PostsView)
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    failing = false
    await wrapper.findAll('button').find((b) => b.text() === 'נסו שוב').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('חדש ב')
  })

  it('team admin edits inline and closing refetches; visitors see no edit button', async () => {
    const editButton = (w, text = 'עריכת עדכונים') => w.findAll('button').find((b) => b.text() === text)
    expect(editButton(await mountView())).toBeUndefined()

    const { useAuth } = await import('../composables/useAuth')
    useAuth().user.value = { id: 1, team_ids: [1] }
    const wrapper = await mountView()
    await editButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').some((b) => b.text() === 'הוספה')).toBe(true)

    global.fetch.mockClear()
    await editButton(wrapper, 'סיום עריכה').trigger('click')
    await flushPromises()
    expect(global.fetch.mock.calls.map(([u]) => u)).toContain('/api/teams/1/posts')
  })
})
