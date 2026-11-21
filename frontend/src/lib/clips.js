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

// The destination flags of a clip, in display order (editor buttons, list badges, the moment row).
export const DESTINATIONS = [
  { field: 'is_highlight', label: 'היילייטס (H)', key: 'H' },
  { field: 'in_game_briefing', label: 'תדריך משחק (B)', key: 'B' },
  { field: 'in_player_briefing', label: 'תדריך שחקן (P)', key: 'P' },
  { field: 'is_player_highlight', label: 'היילייט אישי (A)', key: 'A' },
]

// The clips of video `url` that cover `seconds` (bounds inclusive, so a preview paused at the end still shows its clip).
export function clipsAt(clips, url, seconds) {
  const id = youtubeId(url)
  if (!id) return []
  return clips.filter((c) => youtubeId(c.source_url) === id && c.start !== null && c.end !== null && c.start <= seconds && seconds <= c.end)
}

// "Mark a moment" at `now` seconds: a clip from `before` seconds before to `after` seconds after.
export function momentRange(now, before = 8, after = 3) {
  const whole = Math.floor(now)
  return { start: Math.max(0, whole - before), end: whole + after }
}

// H and B belong to a game; a game-less clip can only be P (mirrors ClipIn._consistent).
export const needsGame = (field) => field === 'is_highlight' || field === 'in_game_briefing'

// A personal highlight needs a tagged player (mirrors ClipIn._consistent).
export const needsPlayer = (field) => field === 'is_player_highlight'

// The studio's stored preferences (panel, larger video, moment window), each field sanitised. `after >= 1` keeps end > start, so M never sends a 422.
export function studioPrefs(raw) {
  const int = (value, min, fallback) => (Number.isInteger(value) && value >= min && value <= 60 ? value : fallback)
  return { shortcutsOpen: !!raw?.shortcutsOpen, theater: !!raw?.theater, before: int(raw?.before, 0, 8), after: int(raw?.after, 1, 3) }
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
  KeyR: 'preview',
  KeyH: 'toggleHighlight',
  KeyB: 'toggleBriefing',
  KeyP: 'togglePlayer',
  KeyA: 'togglePersonal',
  KeyS: 'focusSection',
  Delete: 'delete',
  Enter: 'confirm',
}

// What a key press means in the studio, or null. Keyed by `event.code` so it works on a Hebrew layout.
// Ignored while typing in a field (except Esc, which leaves it) and with ctrl/meta/alt held (browser shortcuts).
export function studioAction(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.code === 'Escape') return { name: 'cancel' }
  if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return null
  if (event.code === 'BracketLeft') return { name: event.shiftKey ? 'nudgeEnd' : 'nudgeStart', delta: -1 }
  if (event.code === 'BracketRight') return { name: event.shiftKey ? 'nudgeEnd' : 'nudgeStart', delta: 1 }
  if (event.code === 'ArrowLeft') return { name: 'seek', delta: -10 } // literal, not mirrored for RTL
  if (event.code === 'ArrowRight') return { name: 'seek', delta: 10 }
  if (event.code === 'Comma') return { name: 'seek', delta: -3 }
  if (event.code === 'Period') return { name: 'seek', delta: 3 }
  if (event.code === 'Minus') return { name: 'rate', step: -1 }
  if (event.code === 'Equal') return { name: 'rate', step: 1 }
  if (/^\d$/.test(event.key)) return { name: 'digit', digit: event.key }
  // a focused button or link already acts on Space/Enter
  if ((event.code === 'Space' || event.code === 'Enter') && event.target?.closest?.('button, a, summary')) return null
  if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) return { name: 'shortcuts' }
  const name = KEYS[event.code]
  return name ? { name } : null
}
