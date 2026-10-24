import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clubOrigin, clubUrl, hostClubId, mainOrigin, teamOrigin } from './site'

function setMeta(name, content) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove()
  if (content == null) return
  const el = document.createElement('meta')
  el.name = name
  el.content = content
  document.head.append(el)
}

beforeEach(() => {
  setMeta('public-url', null)
  setMeta('club-domains', null)
})
afterEach(() => {
  setMeta('public-url', null)
  setMeta('club-domains', null)
})

describe('site', () => {
  it('mainOrigin falls back to location.origin when the meta is missing or empty, else uses it without a trailing slash', () => {
    expect(mainOrigin()).toBe(location.origin)
    setMeta('public-url', '')
    expect(mainOrigin()).toBe(location.origin)
    setMeta('public-url', 'https://main.example/')
    expect(mainOrigin()).toBe('https://main.example')
  })

  it('hostClubId is null on the main site, the club id when club-domains maps it to location.origin, null on malformed JSON', () => {
    expect(hostClubId()).toBeNull()
    setMeta('club-domains', JSON.stringify({ 7: 'https://mj.example' }))
    expect(hostClubId()).toBeNull()
    setMeta('club-domains', JSON.stringify({ 7: location.origin }))
    expect(hostClubId()).toBe('7')
    setMeta('club-domains', '{nope')
    expect(hostClubId()).toBeNull()
  })

  it('teamOrigin resolves a club team to the club domain, a club-less team and a team of a domain-less club to the main origin', () => {
    setMeta('public-url', 'https://main.example')
    setMeta('club-domains', JSON.stringify({ 7: 'https://mj.example' }))
    const clubs = [{ id: 7, name: 'מכבי' }, { id: 8, name: 'הפועל' }]
    expect(teamOrigin({ club: 'מכבי' }, clubs)).toBe('https://mj.example')
    expect(teamOrigin({ club: null }, clubs)).toBe('https://main.example')
    expect(teamOrigin({ club: 'הפועל' }, clubs)).toBe('https://main.example')
    expect(clubOrigin(undefined)).toBe('https://main.example')
  })

  it('clubUrl is the domain root for a domain club, main /clubs/<slug> otherwise', () => {
    setMeta('public-url', 'https://main.example')
    setMeta('club-domains', JSON.stringify({ 7: 'https://mj.example' }))
    expect(clubUrl({ id: 7, name_en: 'Maccabi' })).toBe('https://mj.example/')
    expect(clubUrl({ id: 8, name_en: 'Hapoel Club' })).toBe('https://main.example/clubs/hapoel_club')
  })
})
