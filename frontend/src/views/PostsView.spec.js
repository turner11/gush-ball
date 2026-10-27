import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const POSTS = [
  { id: 1, title: 'נעוץ א', body: 'גוף נעוץ', pinned: true },
  { id: 2, title: 'חדש ב', body: 'גוף חדש', pinned: false },
]

const jsonRes = (body) => ({ ok: true, status: 200, json: async () => body })

async function mountView(posts = POSTS) {
  global.fetch = vi.fn((url) => Promise.resolve(jsonRes(url.endsWith('/games') ? [] : posts)))
  const { default: PostsView } = await import('./PostsView.vue')
  const wrapper = mount(PostsView)
  await flushPromises()
  return wrapper
}

describe('PostsView', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('gush-ball:selected-team-id', '1')
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps the API order and badges pinned posts', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('h1').text()).toBe('עדכונים')
    expect(wrapper.findAll('article h2').map((h) => h.text())).toEqual(['נעוץ א', 'חדש ב'])
    const articles = wrapper.findAll('article')
    expect(articles[0].text()).toContain('נעוץ')
    expect(articles[1].find('.badge').exists()).toBe(false)
    expect(global.fetch.mock.calls.map(([u]) => u)).toEqual(['/api/teams/1/posts'])
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
