import { describe, expect, it } from 'vitest'

import { contrastRatio, onColor } from './teamColors'

describe('onColor', () => {
  it('returns black on light colors and white on dark colors', () => {
    expect(onColor('#ffffff')).toBe('#000000')
    expect(onColor('#ffff00')).toBe('#000000')
    expect(onColor('#000000')).toBe('#ffffff')
    expect(onColor('#1d428a')).toBe('#ffffff')
  })

  it('always meets WCAG AA 4.5:1', () => {
    for (const c of ['#777777', '#808080', '#ff0000', '#00a000', '#ff8800', '#0088ff']) {
      expect(contrastRatio(c, onColor(c))).toBeGreaterThanOrEqual(4.5)
    }
  })
})
