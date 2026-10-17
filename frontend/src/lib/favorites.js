const byName = new Intl.Collator('he').compare

// One order for every team, league and club list: 1) holds a team the user is associated with (a linked player's
// team or a team-scope member grant), 2) holds a team the user admins (team-scope grant only; a club admin grant
// does not lift every club team), both present-or-absent; 3) how many teams the user starred; 4) name. An item is a team (default) or a group whose
// teams `teamsOf` returns. Returns a new array; a null user (anonymous) gives plain alphabetical.
export function byAffinity(items, user, teamsOf = (t) => [t], nameOf = (t) => t.name) {
  const memberships = user?.memberships ?? []
  const playerTeams = new Set(user?.player_team_ids)
  const favorites = new Set(user?.favorite_team_ids)
  const associated = (t) => playerTeams.has(t.id) || memberships.some((m) => m.role === 'member' && m.team_id === t.id)
  const admins = (t) => memberships.some((m) => m.role === 'admin' && m.team_id === t.id)
  const score = new Map(
    items.map((item) => {
      const teams = teamsOf(item)
      return [item, [+teams.some(associated), +teams.some(admins), teams.filter((t) => favorites.has(t.id)).length]]
    }),
  )
  return [...items].sort((a, b) => {
    const [sa, sb] = [score.get(a), score.get(b)]
    return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2] || byName(nameOf(a), nameOf(b))
  })
}
