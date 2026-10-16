import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CLUBS = [
  { id: 1, name: 'גוש', name_en: null, ibasketball_url: 'https://ibasketball.co.il/club/1/' },
  { id: 2, name: 'אחר', ibasketball_url: null },
]

const jsonRes = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error('Unhandled fetch'))
    return Promise.resolve(handler(options))
  })
}

async function mountSection() {
  const { default: ClubsSection } = await import('./ClubsSection.vue')
  const wrapper = mount(ClubsSection)
  await flushPromises()
  return wrapper
}

describe('ClubsSection', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('renders a row per club, or the empty state', async () => {
    mockFetch({ 'GET /api/clubs': () => jsonRes(CLUBS) })
    expect((await mountSection()).findAll('form')).toHaveLength(2)

    mockFetch({ 'GET /api/clubs': () => jsonRes([]) })
    const empty = await mountSection()
    expect(empty.find('.empty-state').exists()).toBe(true)
  })

  it('saves an edited name with PATCH and confirms', async () => {
    let sent
    mockFetch({
      'GET /api/clubs': () => jsonRes(CLUBS),
      'PATCH /api/clubs/1': (options) => {
        sent = JSON.parse(options.body)
        return jsonRes({ ...CLUBS[0], name: 'חדש' })
      },
    })
    const wrapper = await mountSection()

    await wrapper.find('#club-name-1').setValue('חדש')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(sent).toEqual({ name: 'חדש', name_en: null, ibasketball_url: 'https://ibasketball.co.il/club/1/' })
    expect(wrapper.text()).toContain('נשמר')
  })

  it('sends the English name', async () => {
    let sent
    mockFetch({
      'GET /api/clubs': () => jsonRes(CLUBS),
      'PATCH /api/clubs/1': (options) => {
        sent = JSON.parse(options.body)
        return jsonRes({ ...CLUBS[0], name_en: 'Maccabi' })
      },
    })
    const wrapper = await mountSection()

    await wrapper.find('#club-name-en-1').setValue('Maccabi')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(sent.name_en).toBe('Maccabi')
  })

  it('shows a 409 on its own row only', async () => {
    mockFetch({
      'GET /api/clubs': () => jsonRes(CLUBS),
      'PATCH /api/clubs/1': () => jsonRes({ detail: 'taken' }, 409),
    })
    const wrapper = await mountSection()

    await wrapper.find('#club-name-1').setValue('אחר')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const alerts = wrapper.findAll('[role="alert"]')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].text()).toContain('כבר בשימוש')
  })

  it('shows the url message only for 422, a generic error otherwise', async () => {
    for (const [status, text] of [[422, 'דף אגודה'], [500, 'השמירה נכשלה']]) {
      vi.resetModules()
      mockFetch({
        'GET /api/clubs': () => jsonRes(CLUBS),
        'PATCH /api/clubs/1': () => jsonRes({ detail: 'x' }, status),
      })
      const wrapper = await mountSection()
      await wrapper.find('#club-name-1').setValue('אחר')
      await wrapper.find('form').trigger('submit')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').text()).toContain(text)
    }
  })

  it('offers a retry when loading fails', async () => {
    mockFetch({ 'GET /api/clubs': () => jsonRes({ detail: 'x' }, 500) })
    const wrapper = await mountSection()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.findAll('button').some((b) => b.text() === 'נסו שוב')).toBe(true)
  })
})
