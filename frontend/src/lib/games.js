// Split a team's games into upcoming (soonest first) and past (latest first).
export function splitGames(games, now = new Date()) {
  const at = (g) => new Date(g.scheduled_at)
  return {
    upcoming: games.filter((g) => at(g) >= now).sort((a, b) => at(a) - at(b)),
    past: games.filter((g) => at(g) < now).sort((a, b) => at(b) - at(a)),
  }
}
