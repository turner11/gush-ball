import { describe, expect, it } from 'vitest'

import { clipUrl, groupBySection, momentRange, nudge, studioAction, studioPrefs } from './clips'

const YT = 'https://www.youtube.com/watch?v=abcdefghijk'

describe('clipUrl', () => {
  it('puts a YouTube clip segment in the URL', () => {
    expect(clipUrl({ source_url: YT, start: 90, end: 120 })).toBe(`${YT}&t=90&end=120`)
  })
  it('leaves a clip without a segment, a text note and a non-YouTube link alone', () => {
    expect(clipUrl({ source_url: YT, start: null, end: null })).toBe(YT)
    expect(clipUrl({ source_url: null, start: null, end: null })).toBeNull()
    expect(clipUrl({ source_url: 'https://vimeo.com/1', start: 5, end: 9 })).toBe('https://vimeo.com/1')
  })
})

describe('groupBySection', () => {
  it('groups in order of first appearance, sectionless clips together', () => {
    const clips = [{ id: 1, section: 'b' }, { id: 2, section: null }, { id: 3, section: 'a' }, { id: 4, section: 'b' }, { id: 5 }]
    expect(groupBySection(clips).map((g) => [g.section, g.clips.map((c) => c.id)])).toEqual([
      ['b', [1, 4]],
      [null, [2, 5]],
      ['a', [3]],
    ])
  })
})

describe('groupBySection across games', () => {
  it('keeps one section of two games apart, in the order given', () => {
    const clips = [{ id: 1, game_id: 9, section: 'a' }, { id: 2, game_id: 8, section: 'a' }, { id: 3, game_id: 9, section: 'a' }]
    expect(groupBySection(clips).map((g) => g.clips.map((c) => c.id))).toEqual([[1, 3], [2]])
  })
})

describe('momentRange', () => {
  it('is 8s before to 3s after, never before 0', () => {
    expect(momentRange(100.9)).toEqual({ start: 92, end: 103 })
    expect(momentRange(3)).toEqual({ start: 0, end: 6 })
  })
  it('takes a custom window', () => {
    expect(momentRange(100, 5, 2)).toEqual({ start: 95, end: 102 })
    expect(momentRange(3, 5, 2)).toEqual({ start: 0, end: 5 })
  })
})

describe('studioPrefs', () => {
  it('keeps valid values', () => {
    expect(studioPrefs({ shortcutsOpen: true, before: 5, after: 2 })).toEqual({ shortcutsOpen: true, before: 5, after: 2 })
    expect(studioPrefs({ before: 0 }).before).toBe(0)
  })
  it('falls back per field on missing, non-integer or out-of-range values', () => {
    expect(studioPrefs(undefined)).toEqual({ shortcutsOpen: false, before: 8, after: 3 })
    expect(studioPrefs({ before: 1.5, after: 0 })).toMatchObject({ before: 8, after: 3 })
    expect(studioPrefs({ before: -1, after: 61 })).toMatchObject({ before: 8, after: 3 })
    expect(studioPrefs({ before: '5', after: null })).toMatchObject({ before: 8, after: 3 })
  })
})

describe('nudge', () => {
  it('moves one bound by delta', () => {
    expect(nudge({ start: 10, end: 20 }, 'start', -1)).toEqual({ start: 9, end: 20 })
    expect(nudge({ start: 10, end: 20 }, 'end', 1)).toEqual({ start: 10, end: 21 })
  })
  it('refuses a start below 0 or an end that is not after the start', () => {
    expect(nudge({ start: 0, end: 5 }, 'start', -1)).toBeNull()
    expect(nudge({ start: 10, end: 11 }, 'end', -1)).toBeNull()
    expect(nudge({ start: 10, end: 11 }, 'start', 1)).toBeNull()
  })
})

describe('studioAction', () => {
  const key = (init, target = document.body) => studioAction({ target, ...init })
  it('maps layout-independent key codes', () => {
    expect(key({ code: 'KeyM', key: 'צ' })).toEqual({ name: 'moment' })
    expect(key({ code: 'Space', key: ' ' })).toEqual({ name: 'toggle' })
    expect(key({ code: 'KeyH', key: 'h' })).toEqual({ name: 'toggleHighlight' })
    expect(key({ code: 'Delete', key: 'Delete' })).toEqual({ name: 'delete' })
  })
  it('maps ? to the shortcuts panel, but not typed in a field', () => {
    expect(key({ code: 'Slash', key: '?', shiftKey: true })).toEqual({ name: 'shortcuts' })
    expect(key({ code: 'Slash', key: '?', shiftKey: true }, document.createElement('input'))).toBeNull()
  })
  it('nudges start with brackets and end with shift', () => {
    expect(key({ code: 'BracketLeft', key: '[' })).toEqual({ name: 'nudgeStart', delta: -1 })
    expect(key({ code: 'BracketRight', key: '}', shiftKey: true })).toEqual({ name: 'nudgeEnd', delta: 1 })
  })
  it('reads digits for the jersey buffer', () => {
    expect(key({ code: 'Digit1', key: '1' })).toEqual({ name: 'digit', digit: '1' })
  })
  it('ignores keys typed in a field and with ctrl held', () => {
    expect(key({ code: 'KeyM', key: 'm' }, document.createElement('input'))).toBeNull()
    expect(key({ code: 'KeyM', key: 'm', ctrlKey: true })).toBeNull()
    expect(key({ code: 'KeyZ', key: 'z' })).toBeNull()
  })
  it('leaves Space and Enter to a focused button', () => {
    const button = document.createElement('button')
    expect(key({ code: 'Space', key: ' ' }, button)).toBeNull()
    expect(key({ code: 'KeyM', key: 'm' }, button)).toEqual({ name: 'moment' })
  })
})
