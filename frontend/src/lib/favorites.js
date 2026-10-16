// Pure sorting for "favourite teams first". Array.sort is stable, so each list keeps its own order after the stars.
export const favoritesFirst = (teams, ids) => [...teams].sort((a, b) => ids.has(b.id) - ids.has(a.id))

// Items (leagues) with the most favourite teams first; ties keep the existing order.
export function byFavoriteCount(items, teamsOf, ids) {
  const counts = new Map(items.map((item) => [item, teamsOf(item).filter((t) => ids.has(t.id)).length]))
  return [...items].sort((a, b) => counts.get(b) - counts.get(a))
}
