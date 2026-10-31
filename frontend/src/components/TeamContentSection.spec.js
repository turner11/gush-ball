import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const LINKS = [{ id: 10, label: 'אתר הבית', label_en: null, url: 'https://example.com' }]

// The ConfirmDialog's buttons render through an AlertDialog portal teleported to
// document.body, outside the mounted wrapper's own DOM subtree.
function body() {
  return new DOMWrapper(document.body)
}

const FIELDS = [
  { key: 'label', label: 'תווית', type: 'text', required: true },
  { key: 'label_en', label: 'תווית (אנגלית)', type: 'text' },
  { key: 'url', label: 'כתובת', type: 'url', required: true },
]

function mockFetch(handlers) {
  global.fetch = vi.fn((url, options = {}) => {
    const method = options.method || 'GET'
    const key = `${method} ${url}`
    const handler = handlers[key]
    if (!handler) return Promise.reject(new Error(`Unhandled fetch: ${key}`))
    return Promise.resolve(handler())
  })
}

function jsonRes(body, status = 200) {
  return { ok: true, status, json: async () => body }
}

describe('TeamContentSection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('field with upload:true fills the url input after an upload', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes([]),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/x.png' }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = FIELDS.map((f) => (f.key === 'url' ? { ...f, upload: true } : f))
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields },
    })
    await flushPromises()

    const input = wrapper.find('input[type="file"]')
    const file = new File(['a'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('#links-url').element.value).toBe('https://cdn/x.png')
  })

  it("a markdown field's upload appends an image to the body", async () => {
    mockFetch({
      'GET /api/teams/1/posts': () => jsonRes([]),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/x.png' }),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [{ key: 'body', type: 'textarea', markdown: true, label: 'תוכן' }]
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'posts', heading: 'פוסטים', fields },
    })
    await flushPromises()

    await wrapper.find('#posts-body').setValue('א')
    const input = wrapper.find('input[type="file"]')
    const file = new File(['a'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('#posts-body').element.value).toBe('א\n\n![תיאור התמונה](https://cdn/x.png)')
  })

  it('clicking עריכה fills the form and focuses its first field', async () => {
    mockFetch({ 'GET /api/teams/1/links': () => jsonRes(LINKS) })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    const edit = wrapper.findAll('button').find((b) => b.text() === 'עריכה')
    expect(edit.attributes('aria-label')).toBe('עריכה: אתר הבית — https://example.com')
    await edit.trigger('click')
    await flushPromises()

    expect(wrapper.find('#links-label').element.value).toBe('אתר הבית')
    expect(document.activeElement).toBe(wrapper.find('#links-label').element)
    wrapper.unmount()
  })

  it('field with preview:true shows a list thumbnail and a form preview, so tags can be picked by sight', async () => {
    mockFetch({
      'GET /api/teams/1/images': () => jsonRes([{ id: 5, title: 'משחק', url: 'https://cdn/old.png' }]),
      'POST /api/uploads': () => jsonRes({ url: 'https://cdn/new.png' }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'url', label: 'כתובת', type: 'url', required: true, upload: true, preview: true },
    ]
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'images', heading: 'תמונות', fields },
    })
    await flushPromises()

    expect(wrapper.find('li img').attributes('src')).toBe('https://cdn/old.png')
    expect(wrapper.find('form img').exists()).toBe(false)

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['a'], 'a.png', { type: 'image/png' })], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(wrapper.find('form img').attributes('src')).toBe('https://cdn/new.png')
  })

  it('clicking מחיקה opens a confirmation dialog and does not call DELETE until confirmed', async () => {
    mockFetch({ 'GET /api/teams/1/links': () => jsonRes(LINKS) })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    expect(wrapper.text()).toContain('אתר הבית')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('confirming the dialog calls DELETE /api/teams/:id/:resource/:itemId and removes it from the list', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'DELETE /api/teams/1/links/10': () => jsonRes({}),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const confirmButton = body().findAll('[role="alertdialog"] button').find((b) => b.text() === 'מחיקה')
    await confirmButton.trigger('click')
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(wrapper.text()).not.toContain('אתר הבית')
  })

  it('a failed DELETE keeps the item in the list', async () => {
    mockFetch({
      'GET /api/teams/1/links': () => jsonRes(LINKS),
      'DELETE /api/teams/1/links/10': () => ({ ok: false, status: 500, statusText: 'x', json: async () => ({}) }),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text() === 'מחיקה').trigger('click')
    await body().findAll('[role="alertdialog"] button').find((b) => b.text() === 'מחיקה').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('אתר הבית')
  })

  it('cancelling the dialog leaves the item in the list and issues no DELETE request', async () => {
    mockFetch({ 'GET /api/teams/1/links': () => jsonRes(LINKS) })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'links', heading: 'קישורים', fields: FIELDS },
      attachTo: document.body,
    })
    await flushPromises()

    const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'מחיקה')
    await deleteButton.trigger('click')

    const cancelButton = body().findAll('button').find((b) => b.text() === 'ביטול')
    await cancelButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('אתר הבית')
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/teams/1/links/10',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('players field sends an empty array and survives the payload filter', async () => {
    mockFetch({
      'GET /api/teams/1/images': () => jsonRes([]),
      'GET /api/teams/1/players': () => jsonRes([]),
      'POST /api/teams/1/images': () => jsonRes({ id: 1, title: 't', player_ids: [] }, 201),
    })

    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text' },
      { key: 'player_ids', label: 'תיוג שחקנים', type: 'players' },
    ]
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'images', heading: 'תמונות', fields },
    })
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ player_ids: [] })
  })

  describe('reorderable', () => {
    const PLAYS = [
      { id: 5, title: 'ראשון' },
      { id: 6, title: 'שני' },
    ]
    const PLAY_FIELDS = [{ key: 'title', label: 'כותרת', type: 'text', required: true }]
    const mountPlays = async (extra) => {
      const { default: TeamContentSection } = await import('./TeamContentSection.vue')
      const wrapper = mount(TeamContentSection, {
        props: { ownerId: 1, resource: 'plays', heading: 'פלייבוק', fields: PLAY_FIELDS, ...extra },
      })
      await flushPromises()
      return wrapper
    }

    it('moving the first row down PUTs the swapped ids and reorders the list', async () => {
      mockFetch({
        'GET /api/teams/1/plays': () => jsonRes(PLAYS),
        'PUT /api/teams/1/plays/order': () => jsonRes([PLAYS[1], PLAYS[0]]),
      })
      const wrapper = await mountPlays({ reorderable: true })

      await wrapper.find('button[aria-label="הזזה למטה"]').trigger('click')
      await flushPromises()

      const put = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')
      expect(put[0]).toBe('/api/teams/1/plays/order')
      expect(JSON.parse(put[1].body)).toEqual([6, 5])
      expect(wrapper.findAll('li')[0].text()).toContain('שני')
    })

    it('has no move buttons unless reorderable', async () => {
      mockFetch({ 'GET /api/teams/1/plays': () => jsonRes(PLAYS) })
      const wrapper = await mountPlays()
      expect(wrapper.find('button[aria-label="הזזה למטה"]').exists()).toBe(false)
    })
  })

  it('checkbox field posts its boolean and shows a badge, not "true"', async () => {
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'pinned', label: 'נעוץ', type: 'checkbox' },
    ]
    mockFetch({
      'GET /api/teams/1/posts': () => jsonRes([{ id: 5, title: 'חשוב', pinned: true }]),
      'POST /api/teams/1/posts': () => jsonRes({ id: 6, title: 'חדש', pinned: true }, 201),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'posts', heading: 'עדכונים', fields },
    })
    await flushPromises()

    const row = wrapper.find('li')
    expect(row.find('.badge').text()).toBe('נעוץ')
    expect(row.text()).not.toContain('true')

    await wrapper.find('input[type="text"]').setValue('חדש')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ title: 'חדש', pinned: true })
  })

  it('date field shows "עד d.m.y" or a פג תוקף badge, never the raw date (#569)', async () => {
    const fields = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'expires_on', label: 'מוצג בדף הבית עד', type: 'date', nullable: true },
    ]
    mockFetch({
      'GET /api/teams/1/posts': () =>
        jsonRes([
          { id: 1, title: 'עתידי', expires_on: '2999-11-01' },
          { id: 2, title: 'ישן', expires_on: '2000-01-01' },
        ]),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'posts', heading: 'עדכונים', fields },
    })
    await flushPromises()

    const [live, expired] = wrapper.findAll('li')
    expect(live.find('.badge').text()).toBe('עד 01.11.2999')
    expect(live.text()).not.toContain('2999-11-01')
    expect(expired.find('.badge').text()).toBe('פג תוקף')
  })

  it('owner="clubs" lists and creates against /api/clubs/:id/:resource', async () => {
    mockFetch({
      'GET /api/clubs/5/posts': () => jsonRes([]),
      'POST /api/clubs/5/posts': () => jsonRes({ id: 1, title: 'חדש' }, 201),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [{ key: 'title', label: 'כותרת', type: 'text', required: true }]
    const wrapper = mount(TeamContentSection, {
      props: { owner: 'clubs', ownerId: 5, resource: 'posts', heading: 'עדכונים', fields },
    })
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('חדש')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(global.fetch.mock.calls.some(([url, o]) => url === '/api/clubs/5/posts' && o?.method === 'POST')).toBe(true)
  })

  it('move buttons do not cross the pinned boundary', async () => {
    mockFetch({
      'GET /api/teams/1/posts': () =>
        jsonRes([
          { id: 1, title: 'A', pinned: true },
          { id: 2, title: 'B', pinned: false },
        ]),
    })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [{ key: 'title', label: 'כותרת', type: 'text', required: true }]
    const wrapper = mount(TeamContentSection, {
      props: { ownerId: 1, resource: 'posts', heading: 'עדכונים', fields, reorderable: true },
    })
    await flushPromises()

    const [first, second] = wrapper.findAll('li')
    expect(first.find('[aria-label="הזזה למטה"]').attributes('disabled')).toBeDefined()
    expect(second.find('[aria-label="הזזה למעלה"]').attributes('disabled')).toBeDefined()
  })

  it('a markdown field shows a hint and a live preview', async () => {
    mockFetch({ 'GET /api/teams/1/posts': () => jsonRes([]) })
    const { default: TeamContentSection } = await import('./TeamContentSection.vue')
    const fields = [{ key: 'body', label: 'תוכן', type: 'textarea', markdown: true }]
    const wrapper = mount(TeamContentSection, { props: { ownerId: 1, resource: 'posts', heading: 'x', fields } })
    await flushPromises()
    const area = wrapper.find('#posts-body')
    expect(wrapper.find(`#${area.attributes('aria-describedby')}`).exists()).toBe(true)
    expect(wrapper.find('details').exists()).toBe(false)
    await area.setValue('**א**')
    expect(wrapper.find('details .post-body strong').text()).toBe('א')
  })

  describe('game field', () => {
    const POST_FIELDS = [
      { key: 'title', label: 'כותרת', type: 'text', required: true },
      { key: 'game_id', label: 'קשור למשחק', type: 'game' },
    ]
    const GAMES = [{ id: 7, scheduled_at: '2026-05-01T18:00:00', opponent: { name: 'הפועל' } }]
    beforeAll(() => {
      Element.prototype.scrollIntoView = () => {} // jsdom lacks it; reka scrolls the highlighted item
    })
    const mountPosts = async (posts, extra = {}) => {
      mockFetch({ 'GET /api/teams/1/posts': () => jsonRes(posts), 'GET /api/teams/1/games': () => jsonRes(GAMES), ...extra })
      const { default: TeamContentSection } = await import('./TeamContentSection.vue')
      const wrapper = mount(TeamContentSection, { props: { ownerId: 1, resource: 'posts', heading: 'עדכונים', fields: POST_FIELDS }, attachTo: document.body })
      await flushPromises()
      return wrapper
    }
    const importSection = async () => (await import('./TeamContentSection.vue')).default
    const openGames = async (w) => {
      await w.find('#posts-game_id').trigger('click')
      await flushPromises()
    }
    const optionEls = () => new DOMWrapper(document.body).findAll('[role=option]')
    const bodyOf = (method) => JSON.parse(global.fetch.mock.calls.find(([, o]) => o?.method === method)[1].body)

    it('lists games oldest first and mutes past games', async () => {
      const w = await mountPosts([], {
        'GET /api/teams/1/games': () =>
          jsonRes([
            { id: 8, scheduled_at: '2999-01-01T18:00:00', opponent: { name: 'עתיד' } },
            { id: 7, scheduled_at: '2000-01-01T18:00:00', opponent: { name: 'עבר' } },
          ]),
      })
      await openGames(w)
      const options = optionEls()
      expect(options.map((o) => o.text())).toEqual(['ללא משחק', expect.stringContaining('עבר'), expect.stringContaining('עתיד')])
      expect(options[1].classes()).toContain('text-muted')
      expect(options[2].classes()).not.toContain('text-muted')
    })

    it('posts the chosen game_id as a number', async () => {
      const w = await mountPosts([], { 'POST /api/teams/1/posts': () => jsonRes({ id: 1 }, 201) })
      await w.find('#posts-title').setValue('כותרת')
      await openGames(w)
      await optionEls()[1].trigger('click')
      await w.find('form').trigger('submit')
      await flushPromises()
      expect(bodyOf('POST')).toEqual({ title: 'כותרת', game_id: 7 })
    })

    it('fetches posts and games in parallel, and says so when the games fail', async () => {
      const w = await mountPosts([], { 'GET /api/teams/1/games': () => Promise.reject(new Error('down')) })
      expect(w.get('#posts-game_id').attributes('aria-describedby')).toBe('posts-game_id-error')
      expect(w.get('#posts-game_id-error').text()).toBe('טעינת המשחקים נכשלה')
      await openGames(w)
      expect(optionEls().map((o) => o.text())).toEqual(['ללא משחק'])
      const Section = await importSection()
      global.fetch.mockClear()
      // no flush: sequential loading would only have fired the first fetch by now
      const mounted = mount(Section, { props: { ownerId: 1, resource: 'posts', heading: 'x', fields: POST_FIELDS } })
      expect(global.fetch.mock.calls.map(([u]) => u).sort()).toEqual(['/api/teams/1/games', '/api/teams/1/posts'])
      mounted.unmount()
    })

    it('sends null when ללא משחק is chosen on edit, and the list label omits the id', async () => {
      const w = await mountPosts([{ id: 3, title: 'פוסט', game_id: 7 }], { 'PATCH /api/teams/1/posts/3': () => jsonRes({ id: 3 }) })
      expect(w.find('li').text()).not.toContain('7')
      await w.findAll('button').find((b) => b.text() === 'עריכה').trigger('click')
      await openGames(w)
      await optionEls()[0].trigger('click')
      await w.find('form').trigger('submit')
      await flushPromises()
      expect(bodyOf('PATCH').game_id).toBeNull()
    })

    it('a nullable field sends null when emptied on edit', async () => {
      mockFetch({
        'GET /api/teams/1/posts': () => jsonRes([{ id: 3, title: 'פוסט', image_url: 'https://cdn/p.jpg' }]),
        'GET /api/teams/1/games': () => jsonRes([]),
        'PATCH /api/teams/1/posts/3': () => jsonRes({ id: 3 }),
      })
      const Section = await importSection()
      const fields = [...POST_FIELDS, { key: 'image_url', label: 'תמונה', type: 'url', nullable: true }]
      const w = mount(Section, { props: { ownerId: 1, resource: 'posts', heading: 'x', fields } })
      await flushPromises()
      await w.findAll('button').find((b) => b.text() === 'עריכה').trigger('click')
      await w.find('#posts-image_url').setValue('')
      await w.find('form').trigger('submit')
      await flushPromises()
      expect(bodyOf('PATCH').image_url).toBeNull()
    })
  })
})
