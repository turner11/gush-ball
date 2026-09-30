import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./**/*.vue', { query: '?raw', import: 'default', eager: true })

describe('design tokens', () => {
  it('no .vue file hard-codes palette colors or dark: variants', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    for (const [path, src] of Object.entries(sources)) {
      expect(src, path).not.toMatch(/dark:|-(neutral|green|red|amber)-\d/)
    }
  })
})
