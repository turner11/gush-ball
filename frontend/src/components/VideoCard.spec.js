import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import VideoCard from './VideoCard.vue'

const card = (url, title = 'כותרת') => mount(VideoCard, { props: { video: { title, url } } })

describe('VideoCard', () => {
  it('embeds YouTube urls via youtube-nocookie', () => {
    const cases = [
      ['https://www.youtube.com/watch?v=abc123', 'abc123'],
      ['https://youtu.be/xyz', 'xyz'],
      ['https://www.youtube.com/shorts/s1', 's1'],
    ]
    for (const [url, id] of cases) {
      expect(card(url).find('iframe').attributes('src')).toBe(`https://www.youtube-nocookie.com/embed/${id}`)
    }
  })

  it('shows the title under the player', () => {
    const w = card('https://youtu.be/xyz', 'הכותרת')
    const root = w.find('article')
    expect(root.find('iframe').exists()).toBe(true)
    expect(root.find('h3').text()).toBe('הכותרת')
  })

  it('links non-YouTube urls', () => {
    const w = card('https://vimeo.com/1', 'ויימאו')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('a[href="https://vimeo.com/1"]').text()).toBe('ויימאו')
  })
})
