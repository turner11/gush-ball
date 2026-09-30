import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PlayerCard from './PlayerCard.vue'

const PLAYER = {
  id: 3,
  name: 'יוסי כהן',
  jersey_number: 7,
  images: [{ url: '/a.jpg' }, { url: '/b.jpg' }, { url: '/c.jpg' }],
}

function mountCard(props) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/players/:id', name: 'player', component: { template: '<div/>' } }],
  })
  return mount(PlayerCard, { props, global: { plugins: [router] } })
}

describe('PlayerCard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const slide = (w) => w.find('[data-testid="slide"]')
  const shown = (w) => slide(w).attributes('src')

  it('fills the card with a slideshow advancing every 3 seconds while hovered', async () => {
    const w = mountCard({ player: PLAYER })
    expect(slide(w).exists()).toBe(false)

    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)
    expect(shown(w)).toBe('/a.jpg')
    await vi.advanceTimersByTimeAsync(3000)
    expect(shown(w)).toBe('/b.jpg')
    await vi.advanceTimersByTimeAsync(3000)
    expect(shown(w)).toBe('/c.jpg')
    await vi.advanceTimersByTimeAsync(3000)
    expect(shown(w)).toBe('/a.jpg')
  })

  it('stops and resets on mouseleave', async () => {
    const w = mountCard({ player: PLAYER })
    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(4000)
    await w.trigger('mouseleave')
    expect(slide(w).exists()).toBe(false)
    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)
    expect(shown(w)).toBe('/a.jpg')
  })

  it('waits 1 second after hover before the slideshow appears', async () => {
    const w = mountCard({ player: PLAYER })
    await w.trigger('mouseenter')
    expect(slide(w).exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(999)
    expect(slide(w).exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(shown(w)).toBe('/a.jpg')
  })

  it('mouseleave before the delay cancels it', async () => {
    const w = mountCard({ player: PLAYER })
    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(500)
    await w.trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(2000)
    expect(slide(w).exists()).toBe(false)
  })

  it('shows a single image full-card on hover too', async () => {
    const w = mountCard({ player: { ...PLAYER, images: [{ url: '/a.jpg' }] } })
    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(1000)
    expect(shown(w)).toBe('/a.jpg')
  })

  it('links to the player page', () => {
    const w = mountCard({ player: PLAYER })
    expect(w.find('a').attributes('href')).toBe('/players/3')
  })

  it('has no link when compact', () => {
    expect(mountCard({ player: PLAYER, compact: true }).find('a').exists()).toBe(false)
  })
})
