import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonRes = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })

async function setup(user, respond = () => jsonRes(null, 204)) {
  const fetchMock = vi.fn((url, options = {}) => Promise.resolve(respond(url, options)))
  global.fetch = fetchMock
  const { useAuth } = await import('../composables/useAuth.js')
  useAuth().user.value = user
  const { default: FavoriteStar } = await import('./FavoriteStar.vue')
  return { fetchMock, FavoriteStar }
}

describe('FavoriteStar', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when signed out', async () => {
    const { FavoriteStar } = await setup(null)
    expect(mount(FavoriteStar, { props: { teamId: 1, name: 'א' } }).find('button').exists()).toBe(false)
  })

  it('renders nothing in the anonymous preview', async () => {
    const { FavoriteStar } = await setup({ username: 'a', favorite_team_ids: [] })
    const { previewMode } = await import('../composables/useAuth.js')
    previewMode.value = 'anonymous'
    expect(mount(FavoriteStar, { props: { teamId: 1, name: 'א' } }).find('button').exists()).toBe(false)
  })

  it('toggles optimistically and sends PUT/DELETE', async () => {
    let release
    const { FavoriteStar, fetchMock } = await setup(
      { username: 'a', favorite_team_ids: [] },
      () => new Promise((r) => (release = () => r(jsonRes(null, 204)))),
    )
    const button = mount(FavoriteStar, { props: { teamId: 1, name: 'א' } }).find('button')
    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(fetchMock).toHaveBeenCalledWith('/api/me/favorites/1', expect.objectContaining({ method: 'PUT' }))
    release()
    await flushPromises()

    fetchMock.mockImplementation(() => Promise.resolve(jsonRes(null, 204)))
    await button.trigger('click')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/me/favorites/1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('rolls back and shows the error when the request fails', async () => {
    const { FavoriteStar } = await setup({ username: 'a', favorite_team_ids: [] }, () => jsonRes({ detail: 'x' }, 500))
    const button = mount(FavoriteStar, { props: { teamId: 1, name: 'א' } }).find('button')
    await button.trigger('click')
    await flushPromises()
    expect(button.attributes('aria-pressed')).toBe('false')
    const { useFavorites } = await import('../composables/useFavorites.js')
    expect(useFavorites().error.value).toBeTruthy()
  })

  it('clicking the star on a TeamCard does not navigate', async () => {
    const { fetchMock } = await setup({ username: 'a', favorite_team_ids: [] })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/t/1', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const { default: TeamCard } = await import('./TeamCard.vue')
    const wrapper = mount(TeamCard, { props: { name: 'א', to: '/t/1', teamId: 1 }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(fetchMock).toHaveBeenCalled()
  })
})
