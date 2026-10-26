import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CalendarSubscribe from './CalendarSubscribe.vue'

const feedUrl = `${window.location.origin}/api/teams/7/calendar.ics`

function stubClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

// The menu is portalled to <body>, so mounts attach there and the body is the query root.
async function mountOpen(props) {
  const wrapper = mount(CalendarSubscribe, { props: { teamId: 7, ...props }, attachTo: document.body })
  await wrapper.get('button').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  return { wrapper, body: new DOMWrapper(document.body) }
}

const copyItem = (body) => body.findAll('[role=menuitem]').find((i) => i.text().includes('העתקת קישור ל-Google'))

describe('CalendarSubscribe', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('collapses into a single menu button', () => {
    const wrapper = mount(CalendarSubscribe, { props: { teamId: 7 }, attachTo: document.body })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].attributes('aria-haspopup')).toBe('menu')
    expect(buttons[0].text()).toContain('הוספה ליומן')
    expect(document.body.querySelector('a[href^="webcal:"]')).toBeNull()
  })

  it('links to the webcal feed', async () => {
    const { body } = await mountOpen()
    const link = body.get('[role=menuitem][href^="webcal:"]')
    expect(link.attributes('href')).toBe(feedUrl.replace(/^https?:/, 'webcal:'))
    expect(link.text()).toContain('הוספה ליומן')
  })

  it('adds ?practices=1 and the Google refresh note when practices', async () => {
    const { body } = await mountOpen({ practices: true })
    expect(body.get('[role=menuitem][href^="webcal:"]').attributes('href')).toBe(feedUrl.replace(/^https?:/, 'webcal:') + '?practices=1')
    expect(body.text()).toContain('יומן Google מרענן')
    const note = body.findAll('p').find((p) => p.text().includes('יומן Google מרענן'))
    expect(copyItem(body).attributes('aria-describedby')).toBe(note.attributes('id'))
  })

  it('copies the http feed URL and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue()
    stubClipboard(writeText)
    const { wrapper, body } = await mountOpen()
    await copyItem(body).trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(feedUrl)
    expect(wrapper.get('[role=status]').text()).toContain('הקישור הועתק')
  })

  it('shows the URL when copying fails', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const { wrapper, body } = await mountOpen()
    await copyItem(body).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=status]').text()).toContain('לא ניתן להעתיק')
    expect(wrapper.get('code').text()).toBe(feedUrl)
  })
})
