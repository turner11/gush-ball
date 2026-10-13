import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ADMINS = [{ id: 7, username: 'coach', email: 'c@x.com', club: null }]
const USERS = [{ id: 5, username: 'newbie', team_ids: [] }]

// ConfirmDialog renders through a portal teleported to document.body.
const body = () => new DOMWrapper(document.body)

function mockFetch(handlers) {
  const withUsers = { 'GET /api/teams/assignable-users': () => jsonRes([]), ...handlers }
  global.fetch = vi.fn((url, options = {}) => {
    const key = `${options.method || 'GET'} ${url}`
    const handler = withUsers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler(options))
  })
}

const jsonRes = (data, status = 200) => ({ ok: true, status, json: async () => data })

async function mountSection(props = {}, user = { is_admin: true, team_ids: null, clubs: [] }) {
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: TeamAdminsSection } = await import('./TeamAdminsSection.vue')
  const wrapper = mount(TeamAdminsSection, { props: { teamId: 1, ...props }, attachTo: document.body })
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
    await wrapper.find('details form').trigger('submit')
    await flushPromises()

    expect(postBody).toEqual({ username: 'newbie', password: 'longenough', email: 'n@x.com', scope: 'team' })
    expect(wrapper.text()).toContain('newbie')
    expect(wrapper.find('input[type="text"]').element.value).toBe('')
    expect(wrapper.find('input[type="password"]').element.value).toBe('')
    expect(wrapper.find('#admin-email').element.value).toBe('')

    await wrapper.find('input[type="text"]').setValue('plain')
    await wrapper.find('input[type="password"]').setValue('longenough')
    await wrapper.find('details form').trigger('submit')
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
    await wrapper.find('details form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role=alert]').text()).toBe('שם המשתמש כבר קיים')
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('deletes only after confirming', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes(ADMINS),
      'DELETE /api/teams/1/admins/7?scope=team': () => ({ ok: true, status: 204 }),
    })
    const wrapper = await mountSection()
    const del = () => wrapper.findAll('button').find((b) => b.text() === 'הסרה')

    await del().trigger('click')
    await body().findAll('button').find((b) => b.text() === 'ביטול').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('coach')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/teams/1/admins/7?scope=team', expect.anything())

    await del().trigger('click')
    await body().findAll('button').find((b) => b.text() === 'אישור').trigger('click')
    await flushPromises()
    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1/admins/7?scope=team', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('coach')
  })

  it('offers club scope only when the team has a club and posts scope', async () => {
    let postBody
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([]),
      'POST /api/teams/1/admins': (options) => {
        postBody = JSON.parse(options.body)
        return jsonRes({ id: 9, username: 'boss', club: 'Gush' }, 201)
      },
    })
    const plain = await mountSection()
    expect(plain.find('input[type="radio"]').exists()).toBe(false)

    const wrapper = await mountSection({ club: 'Gush' })
    expect(wrapper.findAll('input[name="create-scope"]')).toHaveLength(2)
    await wrapper.find('input[name="create-scope"][value="club"]').setValue()
    await wrapper.find('input[type="text"]').setValue('boss')
    await wrapper.find('input[type="password"]').setValue('longenough')
    await wrapper.find('details form').trigger('submit')
    await flushPromises()

    expect(postBody.scope).toBe('club')
    expect(wrapper.find('input[name="create-scope"][value="team"]').element.checked).toBe(true)
  })

  it('badges club admins', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([...ADMINS, { id: 8, username: 'boss', email: null, club: 'Gush' }]),
    })
    const wrapper = await mountSection({ club: 'Gush' })
    expect(wrapper.findAll('.badge-muted')).toHaveLength(1)
    expect(wrapper.find('.badge-muted').text()).toBe('מנהל מועדון')
  })

  it('assigns an existing user with the picked scope and reloads', async () => {
    let putBody
    let gets = 0
    mockFetch({
      'GET /api/teams/1/admins': () => {
        gets += 1
        return jsonRes(gets === 1 ? [] : [{ id: 5, username: 'newbie', email: null, club: null }])
      },
      'GET /api/teams/assignable-users': () => jsonRes(USERS),
      'PUT /api/teams/1/admins/5': (options) => {
        putBody = JSON.parse(options.body)
        return { ok: true, status: 204 }
      },
    })
    const wrapper = await mountSection()

    await wrapper.find('#assign-user').setValue(5)
    await wrapper.findAll('form')[0].trigger('submit')
    await flushPromises()

    expect(putBody).toEqual({ scope: 'team' })
    expect(gets).toBe(2)
    expect(wrapper.find('ul').text()).toContain('newbie')
  })

  it('club admin sees assign but not create, and no club scope', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([{ id: 8, username: 'boss', email: null, club: 'Gush' }]),
      'GET /api/teams/assignable-users': () => jsonRes(USERS),
    })
    const wrapper = await mountSection({ club: 'Gush' }, { is_admin: true, team_ids: [1], clubs: ['Gush'] })

    expect(wrapper.find('#assign-user').exists()).toBe(true)
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('input[type="radio"]').exists()).toBe(false)
    // the club grant cannot be removed by a club admin
    expect(wrapper.findAll('button').some((b) => b.text() === 'הסרה')).toBe(false)
  })

  it('remove sends scope and keeps account wording', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([{ id: 8, username: 'boss', email: null, club: 'Gush' }]),
      'DELETE /api/teams/1/admins/8?scope=club': () => ({ ok: true, status: 204 }),
    })
    const wrapper = await mountSection({ club: 'Gush' })

    await wrapper.findAll('button').find((b) => b.text() === 'הסרה').trigger('click')
    expect(body().text()).toContain('החשבון עצמו לא יימחק')
    await body().findAll('button').find((b) => b.text() === 'אישור').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith('/api/teams/1/admins/8?scope=club', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('boss')
  })

  it('shows states for a users load failure and for no candidates', async () => {
    mockFetch({
      'GET /api/teams/1/admins': () => jsonRes([]),
      'GET /api/teams/assignable-users': () => ({ ok: false, status: 500, json: async () => ({ detail: 'x' }) }),
    })
    const failed = await mountSection()
    expect(failed.text()).toContain('שגיאה בטעינת המשתמשים')
    expect(failed.find('details').exists()).toBe(true) // create stays usable

    mockFetch({ 'GET /api/teams/1/admins': () => jsonRes([]) })
    const empty = await mountSection()
    expect(empty.text()).toContain('אין משתמשים לשיוך')
  })
})
