import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WikipediaCard from './WikipediaCard.vue'

const URL_HE = 'https://he.m.wikipedia.org/wiki/מכבי_תל_אביב_(כדורסל)'
const SUMMARY = {
  type: 'standard',
  title: 'מכבי תל אביב',
  extract: 'קבוצת כדורסל מתל אביב',
  lang: 'he',
  dir: 'rtl',
  thumbnail: { source: 'https://upload.wikimedia.org/a.png' },
}

function mockFetch(body, ok = true) {
  global.fetch = vi.fn(() => Promise.resolve({ ok, json: async () => body }))
}

async function mountIt(url = URL_HE) {
  const w = mount(WikipediaCard, { props: { url } })
  await flushPromises()
  return w
}

describe('WikipediaCard', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fetches the desktop-host summary for a mobile Hebrew URL and renders the card', async () => {
    mockFetch(SUMMARY)
    const w = await mountIt()

    expect(global.fetch).toHaveBeenCalledWith(
      `https://he.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent('מכבי_תל_אביב_(כדורסל)')}`,
    )
    expect(w.text()).toContain('מכבי תל אביב')
    expect(w.text()).toContain('קבוצת כדורסל מתל אביב')
    expect(w.find('img').attributes('src')).toBe(SUMMARY.thumbnail.source)
    expect(w.find('a').attributes('href')).toBe(URL_HE)
  })

  it('renders nothing when fetch rejects', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline')))
    expect((await mountIt()).find('a').exists()).toBe(false)
  })

  it('renders nothing for a disambiguation page', async () => {
    mockFetch({ ...SUMMARY, type: 'disambiguation' })
    expect((await mountIt()).find('a').exists()).toBe(false)
  })

  it('does not fetch for a non-article URL', async () => {
    mockFetch(SUMMARY)
    const w = await mountIt('https://he.wikipedia.org/w/index.php?curid=1')

    expect(global.fetch).not.toHaveBeenCalled()
    expect(w.find('a').exists()).toBe(false)
  })
})
