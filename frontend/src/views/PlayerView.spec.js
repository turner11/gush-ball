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

  it("shows the player's name and all of their images", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => PLAYER }))
    const wrapper = await mountAt('/players/3')

    expect(global.fetch.mock.calls[0][0]).toBe('/api/players/3')
    expect(wrapper.text()).toContain('יוסי כהן')
    expect(wrapper.findAll('img').map((i) => i.attributes('src'))).toEqual(['/a.jpg', '/b.jpg'])
  })

  it('tells not-found apart from a failed load', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }))
    expect((await mountAt('/players/9')).text()).toContain('השחקן לא נמצא')
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, statusText: 'Error', json: async () => ({}) }))
    expect((await mountAt('/players/9')).text()).toContain('שגיאה בטעינת השחקן')
  })
})
