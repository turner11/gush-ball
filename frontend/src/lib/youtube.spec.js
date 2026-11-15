import { describe, expect, it } from 'vitest'

import { formatTimestamp, parseTimestamp, videoSegment, withVideoSegment, youtubeEmbedUrl } from './youtube'

describe('parseTimestamp', () => {
  it('reads typed and YouTube-style times', () => {
    const cases = [['90', 90], ['1:30', 90], ['1:02:03', 3723], ['1m30s', 90], ['90s', 90], ['1h2m3s', 3723]]
    for (const [text, seconds] of cases) expect(parseTimestamp(text)).toBe(seconds)
  })
  it('maps empty to null and junk to NaN', () => {
    expect(parseTimestamp('  ')).toBeNull()
    expect(parseTimestamp('abc')).toBeNaN()
    expect(parseTimestamp('1:75')).toBeNaN()
  })
})

describe('formatTimestamp', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTimestamp(90)).toBe('1:30')
    expect(formatTimestamp(5)).toBe('0:05')
    expect(formatTimestamp(3723)).toBe('1:02:03')
  })
})

describe('youtubeEmbedUrl segment', () => {
  it('adds start and end', () => {
    expect(youtubeEmbedUrl('https://youtu.be/xyz?t=90&end=120')).toBe('https://www.youtube-nocookie.com/embed/xyz?start=90&end=120')
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=abc&t=1m30s')).toBe('https://www.youtube-nocookie.com/embed/abc?start=90')
  })
  it('is unchanged without a segment', () => {
    expect(youtubeEmbedUrl('https://youtu.be/xyz')).toBe('https://www.youtube-nocookie.com/embed/xyz')
  })
})

describe('withVideoSegment', () => {
  it('sets, clears, normalises and keeps other params', () => {
    const u = withVideoSegment('https://www.youtube.com/watch?v=abc&si=q&start=5', 90, 120)
    expect(u).toContain('v=abc')
    expect(u).toContain('si=q')
    expect(u).not.toContain('start=')
    expect(videoSegment(u)).toEqual({ start: 90, end: 120 })
    expect(videoSegment(withVideoSegment(u, null, null))).toEqual({ start: null, end: null })
  })
  it('handles non-URLs', () => {
    expect(videoSegment('nope')).toEqual({ start: null, end: null })
  })
})
