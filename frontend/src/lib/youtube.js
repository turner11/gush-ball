// The video id of a YouTube link (watch, youtu.be, shorts, embed), or null for any other URL.
function youtubeId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
    if (!u.hostname.endsWith('youtube.com')) return null
    if (u.pathname === '/watch') return u.searchParams.get('v') || null
    return u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? null
  } catch {
    return null // not a URL: a plain link
  }
}

// The youtube-nocookie embed URL for a YouTube link, or null for any other URL.
export function youtubeEmbedUrl(url) {
  const id = youtubeId(url)
  if (!id) return null
  const { start, end } = videoSegment(url)
  const query = new URLSearchParams()
  if (start !== null) query.set('start', start)
  if (end !== null) query.set('end', end)
  return `https://www.youtube-nocookie.com/embed/${id}${query.size ? `?${query}` : ''}`
}

// A youtube.com link to the clip, or null for any other URL. /watch ignores end, so a clip with an end
// links to the full-page embed player, the one youtube.com page that honours both start and end.
export function youtubeLinkUrl(url) {
  const id = youtubeId(url)
  if (!id) return null
  const { start, end } = videoSegment(url)
  if (end !== null) {
    const query = new URLSearchParams()
    if (start !== null) query.set('start', start)
    query.set('end', end)
    return `https://www.youtube.com/embed/${id}?${query}`
  }
  const query = new URLSearchParams({ v: id })
  if (start !== null) query.set('t', start)
  return `https://www.youtube.com/watch?${query}`
}

// Seconds from "90", "1:30", "1:02:03" (typed) or "90s", "1m30s", "1h2m3s" (YouTube's t=). Empty -> null, invalid -> NaN.
export function parseTimestamp(text) {
  const t = String(text ?? '').trim()
  if (!t) return null
  if (/^\d+(:\d{1,2}){0,2}$/.test(t)) {
    const parts = t.split(':').map(Number)
    if (parts.slice(1).some((n) => n > 59)) return NaN
    return parts.reduce((total, n) => total * 60 + n, 0)
  }
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : NaN
}

// "m:ss", or "h:mm:ss" from an hour up.
export function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = String(seconds % 60).padStart(2, '0')
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

const validSeconds = (n) => (Number.isFinite(n) && n >= 0 ? n : null)

// The optional clip of a YouTube URL in seconds: start from t (or start), end from end; each null when absent.
export function videoSegment(url) {
  try {
    const q = new URL(url).searchParams
    return { start: validSeconds(parseTimestamp(q.get('t') ?? q.get('start'))), end: validSeconds(parseTimestamp(q.get('end'))) }
  } catch {
    return { start: null, end: null }
  }
}

// The URL with its clip set to start/end seconds (null clears one).
export function withVideoSegment(url, start, end) {
  const u = new URL(url)
  u.searchParams.delete('start')
  for (const [key, value] of [['t', start], ['end', end]]) {
    if (value === null) u.searchParams.delete(key)
    else u.searchParams.set(key, value)
  }
  return u.toString()
}
