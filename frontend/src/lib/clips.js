// Pure helpers for video clips (#682): rendering a clip, and the studio's keyboard map.
import { withVideoSegment, youtubeId } from './youtube'

// The playable URL of a clip: a YouTube source carries its start/end as t=/end=; anything else is used as is.
export function clipUrl(clip) {
  if (!clip.source_url || !youtubeId(clip.source_url)) return clip.source_url
  return withVideoSegment(clip.source_url, clip.start, clip.end)
}

// [{ section, clips }] in order of first appearance, one group per game and section (a player's briefing spans games); clips without a section form one group (section null).
export function groupBySection(clips) {
  const groups = new Map()
  for (const clip of clips) {
    const section = clip.section ?? null
    const key = `${clip.game_id ?? ''}|${section ?? ''}`
    if (!groups.has(key)) groups.set(key, { section, clips: [] })
    groups.get(key).clips.push(clip)
  }
  return [...groups.values()]
}

// "Mark a moment" at `now` seconds: a clip from 8s before to 3s after.
export function momentRange(now) {
  const whole = Math.floor(now)
  return { start: Math.max(0, whole - 8), end: whole + 3 }
}

// The clip's start or end moved by delta seconds: { start, end }, or null when that would leave start < 0 or end <= start.
export function nudge(clip, which, delta) {
  const next = { start: clip.start ?? null, end: clip.end ?? null }
  next[which] = (next[which] ?? 0) + delta
  if (next.start !== null && next.start < 0) return null
  if (next.end !== null && next.end < 0) return null
  if (next.start !== null && next.end !== null && next.end <= next.start) return null
  return next
}

const KEYS = {
  Space: 'toggle',
  KeyM: 'moment',
  KeyI: 'markStart',
  KeyO: 'markEnd',
  KeyH: 'toggleHighlight',
  KeyB: 'toggleBriefing',
  KeyP: 'togglePlayer',
  KeyS: 'focusSection',
  Delete: 'delete',
  Enter: 'confirm',
  Escape: 'cancel',
}

// What a key press means in the studio, or null. Keyed by `event.code` so it works on a Hebrew layout.
// Ignored while typing in a field and with ctrl/meta/alt held (browser shortcuts).
export function studioAction(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return null
  if (event.code === 'BracketLeft') return { name: event.shiftKey ? 'nudgeEnd' : 'nudgeStart', delta: -1 }
  if (event.code === 'BracketRight') return { name: event.shiftKey ? 'nudgeEnd' : 'nudgeStart', delta: 1 }
  if (/^\d$/.test(event.key)) return { name: 'digit', digit: event.key }
  // a focused button or link already acts on Space/Enter
  if ((event.code === 'Space' || event.code === 'Enter') && event.target?.closest?.('button, a, summary')) return null
  const name = KEYS[event.code]
  return name ? { name } : null
}
