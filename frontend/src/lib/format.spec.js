import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatDateTime, formatDuration, formatGameDate, signed } from './format'

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

describe('formatGameDate', () => {
  it('splits a date into day, month, weekday and time', () => {
    expect(formatGameDate('2030-05-01T18:00:00')).toEqual({ day: '01', month: 'מאי', weekday: 'יום ד׳', time: '18:00' })
  })

  it('returns null for an invalid date', () => {
    expect(formatGameDate('')).toBeNull()
  })
})

describe('signed', () => {
  it('prefixes positives with + and leaves zero and negatives alone', () => {
    expect(signed(5)).toBe('+5')
    expect(signed(0)).toBe('0')
    expect(signed(-3)).toBe('-3')
  })
})

describe('formatDuration', () => {
  it('balances seconds into hours and minutes and omits zero units', () => {
    expect(formatDuration(45)).toBe('45 שניות')
    expect(formatDuration(125)).toBe('שתי דקות, 5 שניות')
    expect(formatDuration(3780)).toBe('1 שעה, 3 דקות')
  })
})
