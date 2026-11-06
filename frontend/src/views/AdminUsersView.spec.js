import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const USERS = [
  { id: 1, username: 'admin', display_name: 'admin', email: 'admin@x.com', memberships: [] },
  {
    id: 2,
    username: 'dana', display_name: 'dana',
    email: 'dana@club.com',
    memberships: [{ team_id: 5, team_name: 'נוער', club: null, role: 'pending' }],
  },
]

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const handler = handlers[`${options.method || 'GET'} ${url}`]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${options.method || 'GET'} ${url}`))
    return Promise.resolve(handler())
  })
}
const jsonRes = (body, status = 200) => ({ ok: true, status, json: async () => body })
const body = () => new DOMWrapper(document.body)

async function mountView(user = { username: 'admin' }) {
  ;(await import('../composables/useAuth')).useAuth().user.value = user
  const { default: AdminUsersView } = await import('./AdminUsersView.vue')
  const wrapper = mount(AdminUsersView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('AdminUsersView', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('lists users with membership badges and filters by email', async () => {
    mockFetch({ 'GET /api/users': () => jsonRes(USERS) })
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('קבוצה: נוער · ממתין')
    await wrapper.find('#admin-user-search').setValue('dana@')
    expect(wrapper.findAll('ul.card > li')).toHaveLength(1)
    expect(wrapper.text()).toContain('dana')

    await wrapper.find('#admin-user-search').setValue('nobody')
    expect(wrapper.text()).toContain('נקה חיפוש')
  })

  it('badges say whether a grant is on a club or a team', async () => {
    const memberships = [
      { team_id: 5, team_name: 'נוער', club: null, role: 'pending' },
      { team_id: null, team_name: null, club: 'Gush', role: 'admin' },
    ]
    mockFetch({ 'GET /api/users': () => jsonRes([{ ...USERS[1], memberships }]) })
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('קבוצה: נוער · ממתין')
    expect(wrapper.text()).toContain('מועדון: Gush · מנהל')
  })

  describe('league and team filters', () => {
    const TEAMS = [
      { id: 5, name: 'נוער', club: 'מועדון א', ibasketball_league_url: 'https://x.il/league/a' },
      { id: 6, name: 'בוגרים', club: 'מועדון ב', ibasketball_league_url: 'https://x.il/league/b' },
      { id: 7, name: 'ילדים', club: 'מועדון ב', ibasketball_league_url: 'https://x.il/league/b' },
      { id: 8, name: 'ריקה', club: 'מועדון ג', ibasketball_league_url: 'https://x.il/league/c' },
    ]
    const LEAGUES = [
      { ibasketball_id: 1, name: 'ליגה א', url: 'https://x.il/league/a' },
      { ibasketball_id: 2, name: 'ליגה ב', url: 'https://x.il/league/b/' },
      { ibasketball_id: 3, name: 'ליגה ג', url: 'https://x.il/league/c' },
    ]
    const FILTER_USERS = [
      { id: 1, username: 'nobody', display_name: 'nobody', email: null, memberships: [] },
      { id: 2, username: 'dana', display_name: 'dana', email: null, memberships: [{ team_id: 5, team_name: 'נוער', club: null, role: 'admin' }] },
      { id: 3, username: 'clubby', display_name: 'clubby', email: null, memberships: [{ team_id: null, team_name: null, club: 'מועדון ב', role: 'admin' }] },
      { id: 4, username: 'ben', display_name: 'ben', email: null, memberships: [{ team_id: 6, team_name: 'בוגרים', club: null, role: 'member' }] },
    ]
    const mounted = async () => {
      mockFetch({
        'GET /api/users': () => jsonRes(FILTER_USERS),
        'GET /api/teams': () => jsonRes(TEAMS),
        'GET /api/leagues': () => jsonRes(LEAGUES),
      })
      const wrapper = await mountView()
      const { default: FilterCombobox } = await import('../components/FilterCombobox.vue')
      const pick = async (id, value) => {
        wrapper.findAllComponents(FilterCombobox).find((c) => c.props('id') === id).vm.$emit('update:modelValue', value)
        await flushPromises()
      }
      const names = () => wrapper.findAll('ul.card > li').map((li) => li.find('span').text())
      return { wrapper, pick, names }
    }

    it('league filter keeps users with a team or club grant in that league', async () => {
      const { pick, names } = await mounted()
      await pick('user-league-filter', '2')
      expect(names().sort()).toEqual(['ben', 'clubby'])
      await pick('user-league-filter', '1')
      expect(names()).toEqual(['dana'])
    })

    it('team filter narrows further and resets when the league excludes it', async () => {
      const { pick, names } = await mounted()
      await pick('user-league-filter', '2')
      await pick('user-team-filter', '6')
      expect(names().sort()).toEqual(['ben', 'clubby'])
      await pick('user-team-filter', '7')
      expect(names()).toEqual(['clubby'])
      await pick('user-league-filter', '1')
      expect(names()).toEqual(['dana'])
    })

    it('filters-only empty state offers נקה סינון that restores the list', async () => {
      const { wrapper, pick, names } = await mounted()
      await pick('user-league-filter', '3')
      expect(wrapper.text()).toContain('אין משתמשים בסינון הנבחר.')
      await wrapper.findAll('button').find((b) => b.text() === 'נקה סינון').trigger('click')
      expect(names()).toHaveLength(4)
    })
  })

  it('delete asks for confirmation, then sends DELETE and removes the row; own row has no delete', async () => {
    mockFetch({
      'GET /api/users': () => jsonRes(USERS),
      'DELETE /api/users/2': () => ({ ok: true, status: 204 }),
    })
    const wrapper = await mountView()

    expect(wrapper.find('[aria-label="מחיקת admin"]').exists()).toBe(false)
    await wrapper.find('[aria-label="מחיקת dana"]').trigger('click')
    expect(global.fetch).not.toHaveBeenCalledWith('/api/users/2', expect.anything())

    await body().find('.btn-danger').trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith('/api/users/2', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.text()).not.toContain('dana')
  })

  describe('assign to team', () => {
    const TEAMS = [
      { id: 5, name: 'נוער', club: null, ibasketball_league_url: null },
      { id: 6, name: 'בוגרים', club: null, ibasketball_league_url: null },
    ]
    const MEMBER = { team_id: 6, team_name: 'בוגרים', club: null, role: 'member' }
    const mounted = async (put, dana = USERS[1]) => {
      mockFetch({
        'GET /api/users': () => jsonRes([USERS[0], dana]),
        'GET /api/teams': () => jsonRes(TEAMS),
        ...put,
      })
      const wrapper = await mountView()
      const { default: FilterCombobox } = await import('../components/FilterCombobox.vue')
      await wrapper.find('[aria-label="שיוך dana"]').trigger('click')
      await flushPromises()
      const combobox = () => wrapper.findAllComponents(FilterCombobox).find((c) => c.props('id') === 'assign-team-2')
      const pick = async (value) => {
        combobox().vm.$emit('update:modelValue', value)
        await flushPromises()
      }
      const submit = async () => {
        await wrapper.find('#assign-panel-2 .btn-primary').trigger('click')
        await flushPromises()
      }
      return { wrapper, combobox, pick, submit }
    }

    it('assigns a user to a team and shows the member badge', async () => {
      const { wrapper, combobox, pick, submit } = await mounted({ 'PUT /api/users/2/teams/6': () => jsonRes(MEMBER) })
      await pick('6')
      await submit()

      expect(global.fetch).toHaveBeenCalledWith('/api/users/2/teams/6', expect.objectContaining({ method: 'PUT' }))
      expect(wrapper.text()).toContain('בוגרים · חבר')
      expect(wrapper.text()).toContain('dana שויך/ה לקבוצה בוגרים')
      expect(combobox()).toBeUndefined()
    })

    it('assigning a pending team replaces the pending badge and hides member teams', async () => {
      const dana = { ...USERS[1], memberships: [USERS[1].memberships[0], MEMBER] }
      const { wrapper, combobox, pick, submit } = await mounted(
        { 'PUT /api/users/2/teams/5': () => jsonRes({ ...USERS[1].memberships[0], role: 'member' }) },
        dana,
      )
      expect(combobox().props('options').map((o) => o.value)).toEqual(['5'])
      await pick('5')
      await submit()

      expect(wrapper.text()).toContain('נוער · חבר')
      expect(wrapper.text()).not.toContain('נוער · ממתין')
    })

    it('assign failure shows an error and keeps the panel open', async () => {
      const { wrapper, combobox, pick, submit } = await mounted({
        'PUT /api/users/2/teams/6': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }),
      })
      await pick('6')
      await submit()

      expect(wrapper.find('[role="alert"]').text()).toContain('שגיאה בשיוך לקבוצה')
      expect(combobox()).toBeDefined()
    })
  })

  describe('assign club admin', () => {
    const CLUB_TEAMS = [
      { id: 5, name: 'נוער', club: 'מועדון א', ibasketball_league_url: null },
      { id: 6, name: 'בוגרים', club: 'מועדון ב', ibasketball_league_url: null },
      { id: 7, name: 'ילדים', club: 'מועדון ב', ibasketball_league_url: null },
      { id: 8, name: 'ריקה', club: 'מועדון ג', ibasketball_league_url: null },
    ]
    const MEMBER = { team_id: 6, team_name: 'בוגרים', club: null, role: 'member' }
    const mounted = async (memberships, put = {}) => {
      mockFetch({
        'GET /api/users': () => jsonRes([USERS[0], { ...USERS[1], memberships }]),
        'GET /api/teams': () => jsonRes(CLUB_TEAMS),
        ...put,
      })
      const wrapper = await mountView()
      const { default: FilterCombobox } = await import('../components/FilterCombobox.vue')
      await wrapper.find('[aria-label="שיוך dana"]').trigger('click')
      await flushPromises()
      const clubRadio = () => wrapper.find('input[type="radio"][value="club"]')
      const combobox = () => wrapper.findAllComponents(FilterCombobox).find((c) => c.props('id') === 'assign-team-2')
      return { wrapper, clubRadio, combobox }
    }

    it("assigns a club admin via the club's team", async () => {
      const { wrapper, clubRadio, combobox } = await mounted([MEMBER], {
        'PUT /api/teams/6/admins/2': () => ({ ok: true, status: 204, json: async () => null }),
      })
      await clubRadio().setValue(true)
      combobox().vm.$emit('update:modelValue', 'מועדון ב')
      await flushPromises()
      expect(wrapper.find('#assign-panel-2 .btn-primary').text()).toBe('מינוי')
      await wrapper.find('#assign-panel-2 .btn-primary').trigger('click')
      await flushPromises()

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/teams/6/admins/2',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ scope: 'club' }) }),
      )
      expect(wrapper.text()).toContain('מועדון: מועדון ב · מנהל')
      expect(wrapper.text()).toContain('dana מונה/תה למנהל/ת מועדון מועדון ב')
      expect(combobox()).toBeUndefined()
    })

    it('club option is disabled for a user with only pending grants', async () => {
      const { clubRadio } = await mounted([{ team_id: 5, team_name: 'נוער', club: null, role: 'pending' }])
      expect(clubRadio().attributes('disabled')).toBeDefined()
    })

    it('clubs the user already admins are not offered', async () => {
      const { clubRadio, combobox } = await mounted([MEMBER, { team_id: null, team_name: null, club: 'מועדון ב', role: 'admin' }])
      await clubRadio().setValue(true)
      expect(combobox().props('options').map((o) => o.value)).toEqual(['מועדון א', 'מועדון ג'])
    })
  })

  it('non-full-admin sees the full-admin-only message and does not fetch /users', async () => {
    mockFetch({})
    const wrapper = await mountView({ username: 'x', team_ids: [1] })

    expect(wrapper.text()).toContain('פעולה זו זמינה למנהל ראשי בלבד')
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/users'), expect.anything())
  })
})
