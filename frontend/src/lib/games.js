// Split a team's games into upcoming (soonest first) and past (latest first).
export function splitGames(games, now = new Date()) {
  const at = (g) => new Date(g.scheduled_at)
  return {
    upcoming: games.filter((g) => at(g) >= now).sort((a, b) => at(a) - at(b)),
    past: games.filter((g) => at(g) < now).sort((a, b) => at(b) - at(a)),
  }
}

export const STATUS_LABELS = {
  scheduled: 'מתוכנן',
  final: 'הסתיים',
  postponed: 'נדחה',
  cancelled: 'בוטל',
}

export const gameStatsRoute = (g) => ({ name: 'roster', query: { game: g.id }, hash: '#lineups' })

export const played = (g) => g.team_score != null && g.opponent_score != null

// Scoreboard order, home side first (rightmost in RTL). Pass what each side shows: scores, names, logos...
export const homeFirst = (g, ours, theirs) => (g.is_home ? [ours, theirs] : [theirs, ours])

// 'W' / 'L' for a played game, null when unscored or tied (no ties in basketball).
export function result(game) {
  const { team_score: a, opponent_score: b } = game
  if (a == null || b == null || a === b) return null
  return a > b ? 'W' : 'L'
}
