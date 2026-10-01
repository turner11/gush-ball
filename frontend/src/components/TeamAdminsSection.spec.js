import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ADMINS = [{ id: 7, username: 'coach', email: 'c@x.com' }]

// ConfirmDialog renders through a portal teleported to document.body.
const body = () => new DOMWrapper(document.body)

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler(options))
  })
}

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => data })

async function mountSection() {
  const { default: TeamAdminsSection } = await import('./TeamAdminsSection.vue')
  const wrapper = mount(TeamAdminsSection, { props: { teamId: 1 }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('TeamAdminsSection', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('lists admins and requires an 8-character password', async () => {
    mockFetch({ 'GET /api/teams/1/admins': () => jsonRes(ADMINS) })
    const wrapper = await mountSection()

    expect(wrapper.text()).toContain('coach')
    expect(wrapper.text()).toContain('c@x.com')
    expect(wrapper.find('#admin-email').attributes('type')).toBe('email')
    expect(wrapper.find('input[type="password"]').attributes('minlength')).toBe('8')
    expect(wrapper.find('#admin-username').attributes('pattern')).toBe('[^@]+')
  })

  it('creates an admin, appends it and clears the inputs', async () => {
    let postBody
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([]),
      'POST /api/teams/1/admins': (options) => {
        postBody = JSON.parse(options.body)
        return jsonRes({ id: 8, username: 'newbie' }, 201)
      },
    })
    const wrapper = await mountSection()

    await wrapper.find('input[type="text"]').setValue('newbie')
    await wrapper.find('#admin-email').setValue(' n@x.com ')
    await wrapper.find('input[type="password"]').setValue('longenough')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(postBody).toEqual({ username: 'newbie', password: 'longenough', email: 'n@x.com' })
    expect(wrapper.text()).toContain('newbie')
    expect(wrapper.find('input[type="text"]').element.value).toBe('')
    expect(wrapper.find('input[type="password"]').element.value).toBe('')
    expect(wrapper.find('#admin-email').element.value).toBe('')

    await wrapper.find('input[type="text"]').setValue('plain')
    await wrapper.find('input[type="password"]').setValue('longenough')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(postBody.email).toBeNull()
  })

  it('shows the server detail on a 409 and does not append', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([]),
      'POST /api/teams/1/admins': () => ({ ok: false, status: 409, json: async () => ({ detail: 'שם המשתמש כבר קיים' }) }),
    })
    const wrapper = await mountSection()

    await wrapper.find('input[type="text"]').setValue('coach')
    await wrapper.find('input[type="password"]').setValue('longenough')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role=alert]').text()).toBe('שם המשתמש כבר קיים')
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('deletes only after confirming', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes(ADMINS),
      'DELETE /api/teams/1/admins/7': () => ({ ok: true, status: 204 }),
    })
    const wrapper = await mountSection()
    const del = () => wrapper.findAll('button').find((b) => b.text() === 'מחיקה')

    await del().trigger('click')
    await body().findAll('button').find((b) => b.text() === 'ביטול').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('coach')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1/admins/7', expect.anything())

    await del().trigger('click')
    await body().findAll('button').find((b) => b.text() === 'אישור').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1/admins/7', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('coach')
  })
})
