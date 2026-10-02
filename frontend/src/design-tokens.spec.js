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
})
