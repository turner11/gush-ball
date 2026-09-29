import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VIDEOS = [
  { id: 1, title: 'ישן', url: 'https://youtu.be/v1' },
  { id: 3, title: 'חדש', url: 'https://youtu.be/v3' },
  { id: 2, title: 'אמצע', url: 'https://youtu.be/v2' },
]
const POSTS = [
  { id: 1, title: 'פוסט ישן', body: 'גוף ישן' },
  { id: 2, title: 'פוסט חדש', body: 'גוף חדש' },
]
const IMAGES = [
  { id: 1, title: 'תמונה א', url: 'https://img/a.jpg' },
  { id: 2, title: 'תמונה ב', url: 'https://img/b.jpg' },
]

function jsonRes(body) {
  return { ok: true, status: 200, json: async () => body }
}

async function mountView({ videos = VIDEOS, posts = POSTS, images = IMAGES } = {}) {
  const data = { videos, posts, images }
  global.fetch = vi.fn((url) => {
    const kind = String(url).split('/').pop()
    if (!(kind in data)) return Promise.reject(new Error(`Unhandled fetch: ${url}`))
    return Promise.resolve(jsonRes(data[kind]))
  })
  const { default: MediaView } = await import('./MediaView.vue')
  const wrapper = mount(MediaView)
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

  it('renders videos, posts and images tabs', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual(['סרטונים', 'עדכונים', 'תמונות'])
  })

  it('renders the tabs root right-to-left', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[dir]').attributes('dir')).toBe('rtl')
  })

  it('shows all videos newest first on the default tab', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual(['חדש', 'אמצע', 'ישן'])
  })

  it('shows all posts on the posts tab', async () => {
    const wrapper = await mountView()
    await openTab(wrapper, 'עדכונים')
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual(['פוסט חדש', 'פוסט ישן'])
    expect(wrapper.text()).toContain('גוף חדש')
    expect(wrapper.text()).toContain('גוף ישן')
  })

  it('shows all images on the images tab', async () => {
    const wrapper = await mountView()
    await openTab(wrapper, 'תמונות')
    expect(wrapper.findAll('img').map((i) => i.attributes('alt'))).toEqual(['תמונה ב', 'תמונה א'])
  })

  it('shows an empty state for a tab with no items', async () => {
    const wrapper = await mountView({ videos: [] })
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })
})
