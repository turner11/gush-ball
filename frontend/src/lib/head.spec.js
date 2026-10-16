import { afterEach, describe, expect, it } from 'vitest'

import { clubJsonLd, pageTitle, playerJsonLd, setCanonical, setJsonLd, setMeta, sportsTeamJsonLd } from './head'

afterEach(() => {
  document.head.querySelectorAll('meta[name], link[rel="canonical"], script').forEach((el) => el.remove())
})

describe('setMeta', () => {
  it('creates, updates, then removes a named meta', () => {
    setMeta('description', 'a')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelector('meta[name="description"]').content).toBe('a')

    setMeta('description', 'b')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelector('meta[name="description"]').content).toBe('b')

    setMeta('description', null)
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
  })
})

describe('setCanonical', () => {
  it('upserts a single link[rel=canonical] and removes on null', () => {
    setCanonical('https://x.org/a')
    setCanonical('https://x.org/b')
    const links = document.head.querySelectorAll('link[rel="canonical"]')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://x.org/b')

    setCanonical(null)
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
  })
})

describe('setJsonLd', () => {
  it('manages one data-page block and leaves other ld+json scripts alone', () => {
    const site = document.createElement('script')
    site.type = 'application/ld+json'
    site.textContent = '{"@type":"WebSite"}'
    document.head.appendChild(site)

    setJsonLd({ a: 1 })
    setJsonLd({ a: 2 })
    const page = document.head.querySelectorAll('script[type="application/ld+json"][data-page]')
    expect(page).toHaveLength(1)
    expect(JSON.parse(page[0].textContent)).toEqual({ a: 2 })
    expect(site.textContent).toBe('{"@type":"WebSite"}')

    setJsonLd(null)
    expect(document.head.querySelector('script[data-page]')).toBeNull()
    expect(document.head.contains(site)).toBe(true)
  })
})

describe('sportsTeamJsonLd', () => {
  it('maps name, sport, url, logo, sameAs, location', () => {
    const team = {
      name: 'קבוצה א',
      logo_url: 'https://cdn.example.com/a.png',
      home_court_address: 'אולם, תל אביב',
      facebook_url: 'https://facebook.com/a',
      instagram_url: 'https://instagram.com/a',
    }
    expect(sportsTeamJsonLd(team, 'https://x.org/team_a')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: 'קבוצה א',
      sport: 'Basketball',
      url: 'https://x.org/team_a',
      logo: 'https://cdn.example.com/a.png',
      sameAs: ['https://facebook.com/a', 'https://instagram.com/a'],
      location: { '@type': 'Place', address: 'אולם, תל אביב' },
    })
  })

  it('omits logo, location and empty socials when unset', () => {
    const out = sportsTeamJsonLd({ name: 'ב', logo_url: null, home_court_address: null, facebook_url: '' }, 'https://x.org/b')
    expect(out).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: 'ב',
      sport: 'Basketball',
      url: 'https://x.org/b',
    })
  })
})

describe('pageTitle', () => {
  // same cases as backend test_title_drops_english_name_when_too_long
  it.each([
    ['אליזור', 'Elizur', 'אליזור · Elizur · כדורסל'],
    ['אליזור', null, 'אליזור · כדורסל'],
    ['אליזור', 'E'.repeat(60), 'אליזור · כדורסל'],
  ])('%s + %s', (base, nameEn, expected) => {
    expect(pageTitle(base, nameEn)).toBe(expected)
  })
})

describe('sportsTeamJsonLd alternateName', () => {
  it('adds alternateName when name_en is set', () => {
    expect(sportsTeamJsonLd({ name: 'א', name_en: 'Team A' }, 'https://x.org/a').alternateName).toBe('Team A')
  })
})

describe('playerJsonLd', () => {
  const team = { name: 'קבוצה א' }
  it('maps name, alternateName, memberOf and the first image', () => {
    const player = { name: 'יוסי', name_en: 'Yossi', images: [{ url: '/a.jpg' }, { url: '/b.jpg' }] }
    expect(playerJsonLd(player, team, 'https://x.org/players/3', 'https://x.org/team_a')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'יוסי',
      url: 'https://x.org/players/3',
      alternateName: 'Yossi',
      memberOf: { '@type': 'SportsTeam', name: 'קבוצה א', url: 'https://x.org/team_a' },
      image: '/a.jpg',
    })
  })

  it('omits alternateName and image when unset', () => {
    const out = playerJsonLd({ name: 'יוסי', name_en: null, images: [] }, team, 'u', 't')
    expect(out).not.toHaveProperty('alternateName')
    expect(out).not.toHaveProperty('image')
  })
})

describe('clubJsonLd', () => {
  const teams = [{ name: 'קבוצה א', url: 'https://x.org/team_a' }]

  it('maps every field the page shows', () => {
    const club = { name: 'מכבי', name_en: 'Maccabi', ibasketball_url: 'https://ibasketball.co.il/club/5/' }
    expect(clubJsonLd(club, 'https://x.org/clubs/maccabi', teams)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsOrganization',
      name: 'מכבי',
      alternateName: 'Maccabi',
      sport: 'Basketball',
      url: 'https://x.org/clubs/maccabi',
      sameAs: ['https://ibasketball.co.il/club/5/'],
      member: [{ '@type': 'SportsTeam', name: 'קבוצה א', url: 'https://x.org/team_a' }],
    })
  })

  it('omits alternateName and sameAs when unset', () => {
    const out = clubJsonLd({ name: 'מכבי', name_en: null, ibasketball_url: null }, 'u', teams)
    expect(out).not.toHaveProperty('alternateName')
    expect(out).not.toHaveProperty('sameAs')
  })
})

describe('sportsTeamJsonLd memberOf', () => {
  it('adds the club when given and leaves it out otherwise', () => {
    const club = { name: 'מכבי', url: 'https://x.org/clubs/maccabi' }
    expect(sportsTeamJsonLd({ name: 'א' }, 'u', club).memberOf).toEqual({ '@type': 'SportsOrganization', name: 'מכבי', url: club.url })
    expect(sportsTeamJsonLd({ name: 'א' }, 'u')).not.toHaveProperty('memberOf')
  })
})
