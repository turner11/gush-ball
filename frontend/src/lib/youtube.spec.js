import { describe, expect, it } from 'vitest'

import { formatTimestamp, parseTimestamp, videoSegment, withVideoSegment, youtubeEmbedUrl, youtubeLinkUrl } from './youtube'

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

describe('youtubeLinkUrl', () => {
  it('opens youtube.com at the clip start', () => {
    expect(youtubeLinkUrl('https://youtu.be/xyz?t=90')).toBe('https://www.youtube.com/watch?v=xyz&t=90')
    expect(youtubeLinkUrl('https://youtu.be/xyz?t=90&end=120')).toBe('https://www.youtube.com/embed/xyz?start=90&end=120')
    expect(youtubeLinkUrl('https://youtu.be/xyz?end=120')).toBe('https://www.youtube.com/embed/xyz?end=120')
    expect(youtubeLinkUrl('https://www.youtube.com/watch?v=abc&t=1m30s')).toBe('https://www.youtube.com/watch?v=abc&t=90')
  })
  it('normalises shorts and embed links to /watch', () => {
    expect(youtubeLinkUrl('https://www.youtube.com/shorts/s1')).toBe('https://www.youtube.com/watch?v=s1')
    expect(youtubeLinkUrl('https://www.youtube.com/embed/abc?start=5')).toBe('https://www.youtube.com/watch?v=abc&t=5')
  })
  it('is null for non-YouTube urls', () => {
    expect(youtubeLinkUrl('https://vimeo.com/1')).toBeNull()
    expect(youtubeLinkUrl('not a url')).toBeNull()
  })
})
