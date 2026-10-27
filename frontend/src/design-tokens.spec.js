import css from './style.css?raw'
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./**/*.vue', { query: '?raw', import: 'default', eager: true })

describe('design tokens', () => {
  it('no .vue file hard-codes palette colors or dark: variants', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/dark:|-(neutral|green|red|amber)-\d/)
    }
  })

  it('no .vue file uses the bare `table-row` class (a Tailwind display utility; rows use table-body-row)', () => {
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/class="[^"]*\btable-row(?![\w-])/)
    }
  })

  it('no tap target is shorter than min-h-11', () => {
    const small = /\bmin-h-(8|9|10)\b/
    expect(css).not.toMatch(small)
    for (const [path, src] of Object.entries(sources)) expect(src, path).not.toMatch(small)
  })

  it('no source file uses the singular "נסה שוב" (copy uses the plural "נסו שוב", #509)', () => {
    const nonSpec = import.meta.glob(['./**/*.{vue,js}', '!./**/*.spec.js'], { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(nonSpec).length).toBeGreaterThan(0)
    for (const [path, src] of Object.entries(nonSpec)) expect(src, path).not.toContain('נסה שוב')
  })

  it('the active tab indicator uses currentColor, never the raw team colour (#520)', () => {
    // a light or dark team colour measures about 1.01:1 on `raised` in one of the two modes
    const tabBar = sources['./components/TabBar.vue']
    expect(tabBar).toContain('after:bg-current')
    expect(tabBar).not.toMatch(/after:bg-team/)
  })

  it('the image hover pop is the shared .image-pop class (#563)', () => {
    const rule = css.match(/\.image-pop\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule).toContain('hover:scale-105')
    expect(rule).toContain('motion-reduce:transition-none')
    for (const f of ['./components/HomeSlideshow.vue', './components/ImageGallery.vue', './views/PlayerView.vue'])
      expect(sources[f], f).toContain('image-pop')
    expect(sources['./components/HomeSlideshow.vue']).not.toContain('hover:scale-105')
  })
})
