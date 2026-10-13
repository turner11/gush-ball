// True when the trimmed, case-insensitive query is a substring of any field (empty query matches all).
export function matchesQuery(query, fields) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((f) => f != null && String(f).toLowerCase().includes(needle))
}
