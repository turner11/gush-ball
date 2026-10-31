import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Editor from './GameStatsRowsEditor.vue'

const ROWS = [
  ['1', '2', '3', '4', '5', '0', '0', '1', '10:00'],
  ['1', '2', '3', '4', '6', '2', '0', '1', '5:00'],
]
const res = (body, status = 200) => ({ ok: status < 400, status, statusText: 'x', json: async () => body })

function mockFetch({ rows = ROWS, put = () => res({ stats_url: null, snapshots: 2 }) } = {}) {
  global.fetch = vi.fn((url, options = {}) => {
    if (url === '/api/teams/1/games/5/stats/rows') return Promise.resolve(options.method === 'PUT' ? put() : res(rows))
    return Promise.reject(new Error(`Unhandled fetch: ${url}`))
  })
}

async function mountEditor() {
  const wrapper = mount(Editor, { props: { teamId: 1, gameId: 5, hasStats: false }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
const puts = () => global.fetch.mock.calls.filter(([, o]) => o?.method === 'PUT')

describe('GameStatsRowsEditor (#601)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('loads saved rows into the inputs', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    expect(wrapper.findAll('[data-row]')).toHaveLength(2)
    expect(wrapper.get('[aria-label="שורה 2, זמן נותר"]').element.value).toBe('5:00')
  })

  it('shows the empty state with no rows', async () => {
    mockFetch({ rows: [] })
    const wrapper = await mountEditor()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('add row copies the previous row, blanks the time and focuses it', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    await wrapper.findAll('button').find((b) => b.text().includes('הוספת שורה')).trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-row]')).toHaveLength(3)
    expect(wrapper.get('[aria-label="שורה 3, שחקן 5"]').element.value).toBe('6')
    expect(wrapper.get('[aria-label="שורה 3, נקודות שלנו"]').element.value).toBe('2')
    const time = wrapper.get('[aria-label="שורה 3, זמן נותר"]')
    expect(time.element.value).toBe('')
    expect(document.activeElement).toBe(time.element)
  })

  it('delete removes that row', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    await wrapper.get('[aria-label="מחיקת שורה 1"]').trigger('click')
    expect(wrapper.findAll('[data-row]')).toHaveLength(1)
    expect(wrapper.get('[aria-label="שורה 1, זמן נותר"]').element.value).toBe('5:00')
  })

  it('submit PUTs all rows, emits saved, keeps the inputs and offers the export only when saved', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    expect(wrapper.find('a[download]').exists()).toBe(true)
    await wrapper.get('[aria-label="שורה 1, זמן נותר"]').setValue('9:00')
    expect(wrapper.find('a[download]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(puts()[0][1].body)[0][8]).toBe('9:00')
    expect(wrapper.emitted('saved')[0]).toEqual([{ has_stats: true }])
    expect(wrapper.findAll('[data-row]')).toHaveLength(2)
    expect(wrapper.text()).toContain('נשמר')
    expect(wrapper.find('a[download]').exists()).toBe(true)
  })

  it('export link is hidden before anything is saved', async () => {
    mockFetch({ rows: [] })
    const wrapper = await mountEditor()
    expect(wrapper.find('a[download]').exists()).toBe(false)
  })

  it('save() returns false and shows the server detail on a 422', async () => {
    mockFetch({ put: () => res({ detail: 'Invalid stats data: 12.0' }, 422) })
    const wrapper = await mountEditor()
    await wrapper.get('[aria-label="שורה 1, זמן נותר"]').setValue('9:00')
    expect(await wrapper.vm.save()).toBe(false)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Invalid stats data')
  })

  it('save() is true without a request when nothing changed', async () => {
    mockFetch()
    const wrapper = await mountEditor()
    expect(await wrapper.vm.save()).toBe(true)
    expect(puts()).toHaveLength(0)
  })
})
