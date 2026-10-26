import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HomeSlideshow from './HomeSlideshow.vue'

const img = (id, extra = {}) => ({ id, title: `t${id}`, url: `/i${id}.jpg`, hidden_from_home: false, ...extra })
const make = (n) => Array.from({ length: n }, (_, k) => img(n - k)) // API order: newest (highest id) first
const srcs = (w) => w.findAll('button[aria-label^="הגדלת"] img').map((i) => i.attributes('src'))
const mountIt = (images) => mount(HomeSlideshow, { props: { images, mediaTo: '/x/media' }, global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })

describe('HomeSlideshow', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('shows at most 4 tiles, newest first, skipping hidden_from_home', () => {
    const w = mountIt([...make(5), img(6, { hidden_from_home: true })])
    expect(srcs(w)).toEqual(['/i5.jpg', '/i4.jpg', '/i3.jpg', '/i2.jpg'])
    expect(mountIt([img(1, { hidden_from_home: true })]).find('section').exists()).toBe(false)
  })

  it('an untitled image gets a fallback alt and button label', () => {
    const w = mountIt([img(1, { title: '' })])
    expect(w.find('img[alt="תמונה של הקבוצה"]').exists()).toBe(true)
    expect(w.find('button').attributes('aria-label')).toBe('הגדלת תמונה: תמונה של הקבוצה')
  })

  it('keeps newer days first and shuffles only within a day', () => {
    const images = [
      img(4, { created_at: '2026-05-02T10:00:00Z' }),
      img(3, { created_at: '2026-05-02T09:00:00Z' }),
      img(2, { created_at: '2026-05-01T10:00:00Z' }),
      img(1, { created_at: '2026-05-01T09:00:00Z' }),
    ]
    const run = (random) => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(random)
      const ids = srcs(mountIt(images))
      spy.mockRestore()
      return ids
    }
    const low = run(0)
    const high = run(0.99)
    for (const ids of [low, high]) {
      expect(ids.slice(0, 2).sort()).toEqual(['/i3.jpg', '/i4.jpg'])
      expect(ids.slice(2).sort()).toEqual(['/i1.jpg', '/i2.jpg'])
    }
    expect(low).not.toEqual(high)
  })

  it('rotates one tile per tick through the rest without duplicates', async () => {
    const w = mountIt(make(7))
    expect(srcs(w)).toEqual(['/i7.jpg', '/i6.jpg', '/i5.jpg', '/i4.jpg'])
    await vi.advanceTimersByTimeAsync(2999)
    expect(srcs(w)[0]).toBe('/i7.jpg')
    await vi.advanceTimersByTimeAsync(1)
    expect(srcs(w)[0]).toBe('/i3.jpg')
    await vi.advanceTimersByTimeAsync(9000)
    expect(new Set(srcs(w)).size).toBe(4)
  })

  it('VITE_HOME_SLIDE_MS sets the interval', async () => {
    vi.stubEnv('VITE_HOME_SLIDE_MS', '1500')
    const w = mountIt(make(7))
    await vi.advanceTimersByTimeAsync(1500)
    expect(srcs(w)[0]).toBe('/i3.jpg')
  })

  it.each(['abc', '200'])('invalid or too-small VITE_HOME_SLIDE_MS (%s) falls back to the default', async (v) => {
    vi.stubEnv('VITE_HOME_SLIDE_MS', v)
    const w = mountIt(make(7))
    await vi.advanceTimersByTimeAsync(1500)
    expect(srcs(w)[0]).toBe('/i7.jpg')
    await vi.advanceTimersByTimeAsync(1500)
    expect(srcs(w)[0]).toBe('/i3.jpg')
  })

  it('pause button stops rotation; no rotation or button with <=4 images', async () => {
    const w = mountIt(make(6))
    await flushPromises()
    await w.get('button[aria-label="השהיית החלפת התמונות"]').trigger('click')
    const before = srcs(w)
    await vi.advanceTimersByTimeAsync(20000)
    expect(srcs(w)).toEqual(before)
    expect(w.find('button[aria-label="הפעלת החלפת התמונות"]').exists()).toBe(true)

    const few = mountIt(make(4))
    await flushPromises()
    expect(few.find('button[aria-label$="החלפת התמונות"]').exists()).toBe(false)
  })

  it('clicking a tile opens the in-page viewer on that image', async () => {
    const w = mountIt(make(3))
    await w.get('button[aria-label^="הגדלת"]').trigger('click')
    expect(w.get('dialog').attributes('open')).toBeDefined()
    expect(w.get('dialog img').attributes('src')).toBe(srcs(w)[0])
    expect(w.find('a[target=_blank]').exists()).toBe(false)
  })
})
