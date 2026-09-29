import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatDateTime } from './format'

const OPTS = { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }

describe('formatDateTime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats with the he-IL locale', () => {
    const out = formatDateTime('2026-10-01T18:00:00')
    expect(out).toBe(new Intl.DateTimeFormat('he-IL', OPTS).format(new Date('2026-10-01T18:00:00')))
    expect(out).toContain('18:00')
    expect(out).toContain('חמישי')
  })

  it('falls back to "dddd, DD/MM/YY HH:mm" when Intl fails', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error()
    })
    expect(formatDateTime('2026-10-01T18:00:00')).toBe('יום חמישי, 01/10/26 18:00')
  })

  it('returns invalid input unchanged', () => {
    expect(formatDateTime('')).toBe('')
  })
})
