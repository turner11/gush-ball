// The one module that touches <head> tags (meta, canonical, per-page JSON-LD).

function upsert(selector, tag, attrs, apply, value) {
  let el = document.head.querySelector(selector)
  if (!value) return el?.remove()
  if (!el) {
    el = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
    document.head.appendChild(el)
  }
  apply(el, value)
}

export const setMeta = (name, content) =>
  upsert(`meta[name="${name}"]`, 'meta', { name }, (el, v) => (el.content = v), content)

export const setCanonical = (href) =>
  upsert('link[rel="canonical"]', 'link', { rel: 'canonical' }, (el, v) => el.setAttribute('href', v), href)

// data-page keeps this off the static WebSite block in index.html.
export const setJsonLd = (data) =>
  upsert(
    'script[type="application/ld+json"][data-page]',
    'script',
    { type: 'application/ld+json', 'data-page': '' },
    (el, v) => (el.textContent = JSON.stringify(v)),
    data,
  )

// Only fields the team home page already shows, so the markup matches visible content.
export function sportsTeamJsonLd(team, url) {
  const sameAs = [team.facebook_url, team.instagram_url, team.youtube_url, team.tiktok_url, team.twitter_url].filter(Boolean)
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.name,
    sport: 'Basketball',
    url,
    ...(team.logo_url && { logo: team.logo_url }),
    ...(sameAs.length && { sameAs }),
    ...(team.home_court_address && { location: { '@type': 'Place', address: team.home_court_address } }),
  }
}
