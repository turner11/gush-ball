import { teamSlug } from '../composables/useSelectedTeam'

// Origins come from <meta>s that Caddy fills from env (index.html); in dev and tests they are empty, so the
// page acts as the main site.
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? ''

export const mainOrigin = () => meta('public-url').replace(/\/$/, '') || location.origin

export function clubDomains() {
  try {
    return JSON.parse(meta('club-domains') || '{}')
  } catch {
    return {}
  }
}

// The club whose own domain is being browsed, or null on the main site.
export const hostClubId = () => Object.keys(clubDomains()).find((id) => clubDomains()[id] === location.origin) ?? null

export const clubOrigin = (club) => clubDomains()[club?.id] ?? mainOrigin()

export const teamOrigin = (team, clubs) => clubOrigin(clubs.find((c) => c.name === team?.club))

// A club page is canonical at its domain root when it has one, so `/` and `/clubs/<slug>` agree.
export const clubUrl = (club) => (clubDomains()[club.id] ? clubDomains()[club.id] + '/' : `${mainOrigin()}/clubs/${teamSlug(club)}`)

export const toMainSite = (path) => window.location.assign(mainOrigin() + path)
