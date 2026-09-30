import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlayerView from './PlayerView.vue'

const PLAYER = {
  id: 3,
  team_id: 1,
  name: 'יוסי כהן',
  jersey_number: 7,
  images: [{ id: 1, url: '/a.jpg' }, { id: 2, url: '/b.jpg' }],
}

// Team media: only items tagged with player 3 belong on the page.
const RESPONSES = {
  '/api/players/3': PLAYER,
  '/api/teams/1/images': [
    { id: 10, title: 'אימון', url: '/t1.jpg', player_ids: [3] },
    { id: 11, title: 'אחר', url: '/other.jpg', player_ids: [4] },
    { id: 12, title: 'גמר', url: '/t2.jpg', player_ids: [4, 3] },
  ],
  '/api/teams/1/videos': [
    { id: 20, title: 'הסל המנצח', url: 'https://example.com/v', player_ids: [3] },
    { id: 21, title: 'לא שלו', url: 'https://example.com/w', player_ids: [] },
  ],
}
const okFetch = () =>
  vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: async () => RESPONSES[url] }))

async function mountAt(path) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/players/:id', component: PlayerView }],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(PlayerView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('PlayerView', () => {
  afterEach(() => vi.restoreAllMocks())

  it("shows the player's own images, then team images they're tagged in (newest first)", async () => {
    global.fetch = okFetch()
    const wrapper = await mountAt('/players/3')

    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.findAll('ul img').map((i) => i.attributes('src'))).toEqual([
      '/a.jpg',
      '/b.jpg',
      '/t2.jpg',
      '/t1.jpg',
    ])
  })

  it('shows only the videos the player is tagged in', async () => {
    global.fetch = okFetch()
    const text = (await mountAt('/players/3')).text()

    expect(text).toContain('הסל המנצח')
    expect(text).not.toContain('לא שלו')
  })

  it('tells not-found apart from a failed load', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }))
    expect((await mountAt('/players/9')).text()).toContain('השחקן לא נמצא')
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) }))
    expect((await mountAt('/players/9')).text()).toContain('שגיאה בטעינת השחקן')
  })
})
