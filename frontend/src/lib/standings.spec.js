import { describe, expect, it } from 'vitest'

import { teamRows } from './standings'

const row = (id, team_name, source_url = null) => ({ id, team_name, source_url })

describe('teamRows', () => {
  it('returns URL matches ahead of name matches', () => {
    const rows = [row(1, 'Ours', null), row(2, 'Other', 'https://x.il/team/ours/')]
    const team = { name: 'Ours', ibasketball_team_url: 'https://x.il/team/ours' }
    expect(teamRows(rows, team).map((r) => r.id)).toEqual([2])
  })

  it('normalises trailing slash and percent-encoding', () => {
    const rows = [row(1, 'a', 'https://x.il/team/%D7%90/')]
    const team = { name: 'zzz', ibasketball_team_url: 'https://x.il/team/א' }
    expect(teamRows(rows, team).map((r) => r.id)).toEqual([1])
  })

  it('falls back to name match and returns [] when nothing matches', () => {
    const rows = [row(1, 'Ours'), row(2, 'Other')]
    expect(teamRows(rows, { name: 'Ours' }).map((r) => r.id)).toEqual([1])
    expect(teamRows(rows, { name: 'None' })).toEqual([])
    expect(teamRows(rows, null)).toEqual([])
  })
})
