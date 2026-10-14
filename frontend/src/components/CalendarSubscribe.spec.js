import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import CalendarSubscribe from './CalendarSubscribe.vue'

const feedUrl = `${window.location.origin}/api/teams/7/calendar.ics`

function stubClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('CalendarSubscribe', () => {
  it('links to the webcal feed', () => {
    const link = mount(CalendarSubscribe, { props: { teamId: 7 } }).get('a')
    expect(link.attributes('href')).toBe(feedUrl.replace(/^https?:/, 'webcal:'))
    expect(link.text()).toContain('הוסף ליומן')
  })

  it('copies the http feed URL and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue()
    stubClipboard(writeText)
    const wrapper = mount(CalendarSubscribe, { props: { teamId: 7 } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(feedUrl)
    expect(wrapper.get('[role=status]').text()).toContain('הקישור הועתק')
  })

  it('shows the URL when copying fails', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const wrapper = mount(CalendarSubscribe, { props: { teamId: 7 } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=status]').text()).toContain('לא ניתן להעתיק')
    expect(wrapper.get('code').text()).toBe(feedUrl)
  })
})
