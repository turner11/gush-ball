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
})
