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

  it('applies the stored face focus to the circle photo', () => {
    const w = mountCard({ player: { ...PLAYER, images: [{ url: '/a.jpg', focus_x: 50, focus_y: 40.5, zoom: 1.5 }] } })
    const style = w.find('img').attributes('style')
    expect(style).toContain('object-position: 50% 40.5%')
    expect(style).toContain('transform-origin: 50% 40.5%')
    expect(style).toContain('transform: scale(1.5)')
  })

  it('keeps top anchoring when an image has no focus', () => {
    const img = mountCard({ player: PLAYER }).find('img')
    expect(img.attributes('style')).toBeUndefined()
    expect(img.classes()).toContain('object-top')
  })

  it("applies each image's face focus to the hover slide", async () => {
    const images = [
      { url: '/a.jpg', focus_x: 50, focus_y: 40.5, zoom: 1.5 },
      { url: '/b.jpg', focus_x: 30, focus_y: 20, zoom: 2 },
    ]
    const w = mountCard({ player: { ...PLAYER, images } })
    await w.trigger('mouseenter')
    expect(slide(w).attributes('style')).toContain('object-position: 50% 40.5%')
    expect(slide(w).attributes('style')).toContain('transform-origin: 50% 40.5%')
    expect(slide(w).attributes('style')).toContain('transform: scale(1.5)')
    await vi.advanceTimersByTimeAsync(1000)
    expect(slide(w).attributes('style')).toContain('object-position: 30% 20%')
    expect(slide(w).attributes('style')).toContain('transform: scale(2)')
  })

  it('keeps top anchoring on the slide when an image has no focus', async () => {
    const w = mountCard({ player: PLAYER })
    await w.trigger('mouseenter')
    expect(slide(w).attributes('style')).toBeUndefined()
    expect(slide(w).classes()).toContain('object-top')
  })

  it('fills the card at once, advances after 1s, then every 3 seconds while hovered', async () => {
    const w = mountCard({ player: PLAYER })
    expect(slide(w).exists()).toBe(false)

    await w.trigger('mouseenter')
    expect(shown(w)).toBe('/a.jpg')
    await vi.advanceTimersByTimeAsync(999)
    expect(shown(w)).toBe('/a.jpg')
    await vi.advanceTimersByTimeAsync(1)
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
    expect(shown(w)).toBe('/a.jpg')
  })

  it('mouseleave before the first advance cancels it', async () => {
    const w = mountCard({ player: PLAYER })
    await w.trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(500)
    await w.trigger('mouseleave')
    await vi.advanceTimersByTimeAsync(2000)
    expect(slide(w).exists()).toBe(false)
    await w.trigger('mouseenter')
    expect(shown(w)).toBe('/a.jpg')
  })

  it('shows a single image full-card on hover too', async () => {
    const w = mountCard({ player: { ...PLAYER, images: [{ url: '/a.jpg' }] } })
    await w.trigger('mouseenter')
    expect(shown(w)).toBe('/a.jpg')
    await vi.advanceTimersByTimeAsync(10000)
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
