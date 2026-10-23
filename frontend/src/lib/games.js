import { formatGameDate } from './format'

// Comparator: earliest game first.
export const byDate = (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)

// Split a team's games into upcoming (soonest first) and past (latest first).
export function splitGames(games, now = new Date()) {
  const at = (g) => new Date(g.scheduled_at)
  return {
    upcoming: games.filter((g) => at(g) >= now).sort(byDate),
    past: games.filter((g) => at(g) < now).sort((a, b) => byDate(b, a)),
  }
}

export const STATUS_LABELS = {
  scheduled: 'מתוכנן',
  final: 'הסתיים',
  postponed: 'נדחה',
  cancelled: 'בוטל',
}

export const gameStatsRoute = (g) => ({ name: 'stats', query: { game: g.id } })

// Where the game is played: our court at home, the opponent's address away.
export const gameAddress = (g, team) => (g.is_home ? team?.home_court_address : g.opponent?.address)

export const played = (g) => g.team_score != null && g.opponent_score != null

// Scoreboard order, home side first (rightmost in RTL). Pass what each side shows: scores, names, logos...
export const homeFirst = (g, ours, theirs) => (g.is_home ? [ours, theirs] : [theirs, ours])

// 'W' / 'L' for a played game, null when unscored or tied (no ties in basketball).
export function result(game) {
  const { team_score: a, opponent_score: b } = game
  if (a == null || b == null || a === b) return null
  return a > b ? 'W' : 'L'
}

// BBStats Streamlit link for an admin who can edit this game's team; null when any piece is missing.
export function liveStatsUrl(game, user, origin = window.location.origin) {
  if (!user?.stats_app_url || !game.stats_url) return null
  if (user.team_ids && !user.team_ids.includes(game.team_id)) return null
  const query = new URLSearchParams({
    data: game.stats_url,
    team_api: `${origin}/api/teams/${game.team_id}/players`,
    return_url: `${origin}/schedule`, // BBStats shows a "Back to the game" link to it
  })
  return `${user.stats_app_url}?${query}`
}

// Google Sheets "make a copy" link for a sheet URL or bare sheet ID; null for anything else.
export function sheetCopyUrl(value) {
  const v = value.trim()
  const id = v.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/?#]+)/)?.[1] ?? v.match(/^[\w-]+$/)?.[0]
  return id ? `https://docs.google.com/spreadsheets/d/${id}/copy` : null
}

// Short "05 ינו׳" label for chart axes and picker options.
export function gameDayLabel(value) {
  const { day, month } = formatGameDate(value)
  return `${day} ${month}`
}

// Scorer rows (oldest game first, as the API returns them) grouped by player.
export function scoringByPlayer(rows) {
  const byPlayer = new Map()
  for (const r of rows) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r])
  return byPlayer
}
