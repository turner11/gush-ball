// True when the trimmed, case-insensitive query is a substring of any field (empty query matches all).
export function matchesQuery(query, fields) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((f) => f != null && String(f).toLowerCase().includes(needle))
}

// Rank 0: a team field starts with the query (or empty query), 1: a team field contains it, 2: another field contains it, null: no match.
export function matchRank(query, teamFields, otherFields) {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const lower = (fields) => fields.filter((f) => f != null).map((f) => String(f).toLowerCase())
  const team = lower(teamFields)
  if (team.some((f) => f.startsWith(needle))) return 0
  if (team.some((f) => f.includes(needle))) return 1
  return lower(otherFields).some((f) => f.includes(needle)) ? 2 : null
}
