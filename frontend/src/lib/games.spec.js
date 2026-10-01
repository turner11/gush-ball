import { describe, expect, it } from 'vitest'

import { homeFirst, liveStatsUrl, played, result, sheetCopyUrl } from './games'

describe('played', () => {
  it('needs both scores', () => {
    expect(played({ team_score: 0, opponent_score: 0 })).toBe(true)
    expect(played({ team_score: 80, opponent_score: null })).toBe(false)
    expect(played({ team_score: null, opponent_score: null })).toBe(false)
  })
})

describe('homeFirst', () => {
  it('puts the home side first', () => {
    expect(homeFirst({ is_home: true }, 'us', 'them')).toEqual(['us', 'them'])
    expect(homeFirst({ is_home: false }, 'us', 'them')).toEqual(['them', 'us'])
  })
})

describe('result', () => {
  it('returns W, L or null', () => {
    expect(result({ team_score: 80, opponent_score: 70 })).toBe('W')
    expect(result({ team_score: 70, opponent_score: 80 })).toBe('L')
    expect(result({ team_score: null, opponent_score: 80 })).toBeNull()
    expect(result({ team_score: 80, opponent_score: null })).toBeNull()
    expect(result({ team_score: 70, opponent_score: 70 })).toBeNull()
  })
})

describe('liveStatsUrl', () => {
  const game = { id: 7, team_id: 3, stats_url: 'https://docs.google.com/spreadsheets/d/X/edit' }
  const admin = { team_id: null, stats_app_url: 'https://app.streamlit.app' }
  const origin = 'https://gush.example'

  it('gives a full admin the app link with the sheet and team players api', () => {
    const url = new URL(liveStatsUrl(game, admin, origin))
    expect(url.origin).toBe('https://app.streamlit.app')
    expect(url.searchParams.get('data')).toBe(game.stats_url)
    expect(url.searchParams.get('team_api')).toBe('https://gush.example/api/teams/3/players')
  })

  it('adds an encoded return_url back to the game's stats page', () => {
    const link = liveStatsUrl(game, admin, origin)
    expect(new URL(link).searchParams.get('return_url')).toBe('https://gush.example/stats?game=7')
    expect(link).toContain('return_url=https%3A%2F%2Fgush.example%2Fstats%3Fgame%3D7')
  })

  it('scopes team admins to their own team', () => {
    expect(liveStatsUrl(game, { ...admin, team_id: 3 }, origin)).not.toBeNull()
    expect(liveStatsUrl(game, { ...admin, team_id: 4 }, origin)).toBeNull()
  })

  it('is null without a user, a sheet, or an app url', () => {
    expect(liveStatsUrl(game, null, origin)).toBeNull()
    expect(liveStatsUrl({ ...game, stats_url: null }, admin, origin)).toBeNull()
    expect(liveStatsUrl(game, { ...admin, stats_app_url: '' }, origin)).toBeNull()
  })
})

describe('sheetCopyUrl', () => {
  it('turns a sheet url into its make-a-copy url', () => {
    const copy = 'https://docs.google.com/spreadsheets/d/ID/copy'
    expect(sheetCopyUrl('https://docs.google.com/spreadsheets/d/ID/edit?usp=sharing#gid=0')).toBe(copy)
    expect(sheetCopyUrl('https://docs.google.com/spreadsheets/d/ID')).toBe(copy)
  })

  it('leaves other urls alone', () => {
    expect(sheetCopyUrl('https://example.com/x')).toBe('https://example.com/x')
  })
})
