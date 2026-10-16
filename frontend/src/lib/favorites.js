const byName = new Intl.Collator('he').compare

const covers = (m, team) => m.team_id === team.id || (!!m.club && m.club === team.club)

// One order for every team, league and club list: how many of its teams the user is a member of, then admin of,
// then has starred, then by name. An item is a team (default) or a group whose teams `teamsOf` returns.
// Returns a new array; a null user (anonymous) gives plain alphabetical.
export function byAffinity(items, user, teamsOf = (t) => [t], nameOf = (t) => t.name) {
  const memberships = user?.memberships ?? []
  const favorites = new Set(user?.favorite_team_ids)
  const countBy = (teams, pred) => teams.filter(pred).length
  const score = new Map(
    items.map((item) => {
      const teams = teamsOf(item)
      const held = (role) => countBy(teams, (t) => memberships.some((m) => m.role === role && covers(m, t)))
      return [item, [held('member'), held('admin'), countBy(teams, (t) => favorites.has(t.id))]]
    }),
  )
  return [...items].sort((a, b) => {
    const [sa, sb] = [score.get(a), score.get(b)]
    return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2] || byName(nameOf(a), nameOf(b))
  })
}
