// Roster order: numbered players first (ascending), then by name, then id.
// Mirrors _roster_order in backend/app/routers/players.py; plain < / > matches Python's code-point str order.
export function byRosterOrder(a, b) {
  const aNone = a.jersey_number == null
  const bNone = b.jersey_number == null
  if (aNone !== bNone) return aNone ? 1 : -1
  if (!aNone && a.jersey_number !== b.jersey_number) return a.jersey_number - b.jersey_number
  const an = a.name.toLowerCase()
  const bn = b.name.toLowerCase()
  if (an !== bn) return an < bn ? -1 : 1
  return a.id - b.id
}
