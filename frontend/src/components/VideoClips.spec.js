import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import VideoClips from './VideoClips.vue'

const clip = (fields) => ({ id: 1, source_url: null, start: null, end: null, section: null, note: null, ...fields })
const yt = (id) => `https://youtu.be/${id}aaaaaaaaaa`.slice(0, 28)

describe('VideoClips', () => {
  it('groups clips by section: a lone video keeps its card title, several get a heading', () => {
    const wrapper = mount(VideoClips, {
      props: {
        clips: [
          clip({ id: 1, section: 'סל', source_url: yt('a') }),
          clip({ id: 2, section: 'הגנה', source_url: yt('b') }),
          clip({ id: 3, section: 'הגנה', source_url: yt('c') }),
        ],
      },
    })
    expect(wrapper.findAll('iframe').map((f) => f.attributes('title'))).toEqual(['סל', 'הגנה 1', 'הגנה 2'])
    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['סל', 'הגנה'])
  })

  it('shows a clip note under its video, in full', () => {
    const wrapper = mount(VideoClips, { props: { clips: [clip({ section: 'x', source_url: yt('a'), note: 'שימו לב\nלחסימה' })] } })
    expect(wrapper.get('p.whitespace-pre-line').text()).toContain('שימו לב')
    expect(wrapper.get('article').text()).not.toContain('שימו לב')
  })

  it('renders a text note without a video', () => {
    const wrapper = mount(VideoClips, { props: { clips: [clip({ section: 'הערות', note: 'טקסט חופשי' })] } })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('הערות')
    expect(wrapper.text()).toContain('טקסט חופשי')
  })

  it('renders a non-YouTube clip as a link card', () => {
    const wrapper = mount(VideoClips, { props: { clips: [clip({ section: 'וימאו', source_url: 'https://vimeo.com/1' })] } })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.get('a').attributes('href')).toBe('https://vimeo.com/1')
  })
})
