const normUrl = (u) => {
  try {
    return decodeURIComponent(u).replace(/\/$/, '')
  } catch {
    return u // admin-pasted URLs can be truncated/invalid percent-encoding
  }
}

// The standing rows that belong to `team`. URL is the reliable key (names differ between our Team and
// ibasketball); name is the fallback.
export function teamRows(rows, team) {
  const teamUrl = team?.ibasketball_team_url
  const byUrl = teamUrl ? rows.filter((r) => r.source_url && normUrl(r.source_url) === normUrl(teamUrl)) : []
  return byUrl.length ? byUrl : rows.filter((r) => r.team_name === team?.name)
}
