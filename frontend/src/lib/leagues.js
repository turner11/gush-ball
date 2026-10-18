// The league slug: last non-empty path segment, so a trailing slash does not matter.
export function leagueKey(url) {
  const segment = (url ?? '').split('/').filter(Boolean).pop()
  return segment ? decodeURIComponent(segment).toLowerCase() : null
}
