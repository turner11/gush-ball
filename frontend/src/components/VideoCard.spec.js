import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VideoCard from './VideoCard.vue'

const card = (url, title = 'כותרת') => mount(VideoCard, { props: { video: { title, url } } })

let players
beforeEach(() => {
  players = []
  window.YT = {
    Player: class {
      constructor(el, opts) {
        this.el = el
        this.opts = opts
        this.pauseVideo = vi.fn()
        this.cueVideoById = vi.fn()
        players.push(this)
      }
    },
  }
})
afterEach(() => {
  delete window.YT
})

// YT.PlayerState: 0 ended, 1 playing
const fire = (player, data) => player.opts.events.onStateChange({ data, target: player })

describe('VideoCard', () => {
  it('replays its segment when played again after it ends', async () => {
    const w = card('https://youtu.be/xyz?t=90&end=130')
    await flushPromises()
    fire(players[0], 0)
    expect(players[0].cueVideoById).toHaveBeenCalledWith({ videoId: 'xyz', startSeconds: 90, endSeconds: 130 })
    w.unmount()
  })

  it("leaves a whole video to YouTube's own replay", async () => {
    const w = card('https://youtu.be/xyz')
    await flushPromises()
    fire(players[0], 0)
    expect(players[0].cueVideoById).not.toHaveBeenCalled()
    w.unmount()
  })

  it('playing one video pauses the one already playing', async () => {
    const a = card('https://youtu.be/a')
    const b = card('https://youtu.be/b')
    await flushPromises()
    fire(players[0], 1)
    fire(players[1], 1)
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1)
    expect(players[1].pauseVideo).not.toHaveBeenCalled()
    fire(players[1], 1)
    expect(players[0].pauseVideo).toHaveBeenCalledTimes(1)
    a.unmount()
    b.unmount()
  })


  it('embeds YouTube urls via youtube-nocookie', () => {
    const cases = [
      ['https://www.youtube.com/watch?v=abc123', 'abc123'],
      ['https://youtu.be/xyz', 'xyz'],
      ['https://www.youtube.com/shorts/s1', 's1'],
    ]
    for (const [url, id] of cases) {
      expect(card(url).find('iframe').attributes('src')).toBe(`https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1`)
    }
  })

  it('shows the title under the player', () => {
    const w = card('https://youtu.be/xyz', 'הכותרת')
    const root = w.find('article')
    expect(root.find('iframe').exists()).toBe(true)
    expect(root.find('h3').text()).toBe('הכותרת')
  })

  it('hides the heading but keeps the iframe title when showTitle is false', () => {
    const w = mount(VideoCard, { props: { video: { title: 'דוגמאות 2', url: 'https://youtu.be/xyz' }, showTitle: false } })
    expect(w.find('h3').exists()).toBe(false)
    expect(w.get('iframe').attributes('title')).toBe('דוגמאות 2')
    expect(w.get('a').attributes('aria-label')).toContain('דוגמאות 2')
  })

  it('shows the description when present', () => {
    const withText = mount(VideoCard, { props: { video: { title: 't', url: 'https://youtu.be/x', text: 'תיאור' } } })
    expect(withText.text()).toContain('תיאור')
    expect(card('https://youtu.be/x').findAll('p').filter((p) => p.text() === 'תיאור')).toHaveLength(0)
  })

  it('links non-YouTube urls', () => {
    const w = card('https://vimeo.com/1', 'ויימאו')
    expect(w.find('iframe').exists()).toBe(false)
    expect(w.find('a[href="https://vimeo.com/1"]').text()).toBe('ויימאו')
    expect(w.findAll('a')).toHaveLength(1)
  })

  it('links to YouTube at the segment start', () => {
    const link = card('https://youtu.be/xyz?t=90&end=130').find('a[href="https://www.youtube.com/watch?v=xyz&t=90"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('target')).toBe('_blank')
  })

  it('labels a segment', () => {
    const text = card('https://youtu.be/xyz?t=90&end=130').text()
    expect(text).toContain('1:30')
    expect(text).toContain('2:10')
    expect(card('https://youtu.be/xyz').text()).not.toContain('קטע')
  })

  it('updates the segment label when the video changes', async () => {
    const w = card('https://youtu.be/xyz?t=90&end=130')
    await w.setProps({ video: { title: 'x', url: 'https://youtu.be/abc' } })
    expect(w.text()).not.toContain('קטע')
  })
})
