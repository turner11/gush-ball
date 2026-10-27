import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FeaturedPosts from './FeaturedPosts.vue'

const item = (id, label = null, image_url = null) => ({ post: { id, title: `כותרת ${id}`, body: `גוף ${id}`, image_url }, label })
const mountIt = (items) =>
  mount(FeaturedPosts, { props: { items, postsTo: '/x/posts' }, global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
const title = (w) => w.find('h2').text()
const dots = (w) => w.findAll('button[aria-label^="עדכון"]')

describe('FeaturedPosts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  })
  afterEach(() => vi.useRealTimers())

  it('shows the first item with its label and a CTA deep link to the post', () => {
    const w = mountIt([item(1, 'לקראת המשחק נגד הפועל'), item(2)])
    expect(title(w)).toBe('כותרת 1')
    expect(w.text()).toContain('לקראת המשחק נגד הפועל')
    expect(w.find('a').attributes('href')).toBe('/x/posts#post-1')
  })

  it('shows the title but not the body', () => {
    const w = mountIt([item(1)])
    expect(w.text()).toContain('כותרת 1')
    expect(w.text()).not.toContain('גוף 1')
  })

  it('uses the post image as the slide background, and keeps the team colour without one', () => {
    const withImage = mountIt([item(1, null, 'https://cdn/p.jpg')])
    expect(withImage.find('img[src="https://cdn/p.jpg"]').attributes('alt')).toBe('')
    expect(withImage.find('section').classes()).toContain('text-white')
    const plain = mountIt([item(1)])
    expect(plain.find('img').exists()).toBe(false)
    expect(plain.find('section').classes()).toContain('bg-team')
  })

  it('a dot selects its slide, marks it current and stops auto-advance', async () => {
    const w = mountIt([item(1), item(2), item(3)])
    await dots(w)[1].trigger('click')
    expect(title(w)).toBe('כותרת 2')
    expect(dots(w)[1].attributes('aria-current')).toBe('true')
    vi.advanceTimersByTime(20000)
    await flushPromises()
    expect(title(w)).toBe('כותרת 2')
  })

  it('advances after 7000 ms, and the pause button stops it', async () => {
    const w = mountIt([item(1), item(2), item(3)])
    vi.advanceTimersByTime(7000)
    await flushPromises()
    expect(title(w)).toBe('כותרת 2')
    await w.find('button[aria-label="השהיית החלפת העדכונים"]').trigger('click')
    vi.advanceTimersByTime(20000)
    await flushPromises()
    expect(title(w)).toBe('כותרת 2')
  })

  it('keeps aria-live on the persistent carousel, not the re-inserted slide', async () => {
    const w = mountIt([item(1), item(2)])
    expect(w.find('section').attributes('aria-live')).toBe('off')
    await w.find('button[aria-label="השהיית החלפת העדכונים"]').trigger('click')
    expect(w.find('section').attributes('aria-live')).toBe('polite')
    expect(w.find('[role="group"]').attributes('aria-live')).toBeUndefined()
  })

  it('one item has no dots, pause or rotation', () => {
    const w = mountIt([item(1)])
    expect(dots(w)).toHaveLength(0)
    expect(w.find('button[aria-label$="החלפת העדכונים"]').exists()).toBe(false)
  })

  it('does not rotate under reduced motion', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const w = mountIt([item(1), item(2)])
    vi.advanceTimersByTime(20000)
    await flushPromises()
    expect(title(w)).toBe('כותרת 1')
  })

  it('renders nothing without items', () => {
    expect(mountIt([]).find('section').exists()).toBe(false)
  })
})
