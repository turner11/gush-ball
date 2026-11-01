import { describe, expect, it } from 'vitest'

import { featuredPosts, feedPosts, homePosts } from './posts'

const NOW = new Date('2026-10-27T12:00:00Z')
const day = (n) => new Date(NOW.getTime() - n * 86400000).toISOString()
const post = (id, extra = {}) => ({ id, title: `p${id}`, ...extra })
const next = { id: 10, opponent: { name: 'הפועל' } }
const last = { id: 9, opponent: { name: 'מכבי' } }
const ids = (items) => items.map((i) => i.post.id)

describe('featuredPosts', () => {
  it('orders next-game, last-game, then recent posts, capped at 3, with labels', () => {
    const posts = [post(1, { created_at: day(1) }), post(2, { game_id: 9 }), post(3, { game_id: 10 }), post(4, { created_at: day(2) })]
    const out = featuredPosts(posts, next, last, NOW)
    expect(ids(out)).toEqual([3, 2, 1])
    expect(out.map((i) => i.label)).toEqual(['לקראת המשחק נגד הפועל', 'מהמשחק נגד מכבי', null])
  })

  it('lists a post once even when it matches two tiers', () => {
    const out = featuredPosts([post(1, { game_id: 10, created_at: day(1) })], next, last, NOW)
    expect(ids(out)).toEqual([1])
    expect(out[0].label).toBe('לקראת המשחק נגד הפועל')
  })

  it('skips posts older than 14 days or undated when an earlier tier filled', () => {
    const posts = [post(1, { created_at: day(20) }), post(2), post(3, { game_id: 10 })]
    expect(ids(featuredPosts(posts, next, last, NOW))).toEqual([3])
  })

  it('falls back to the first post (pinned first) when nothing matches', () => {
    const posts = [post(1, { created_at: day(30) }), post(2, { created_at: day(40) })]
    expect(ids(featuredPosts(posts, next, last, NOW))).toEqual([1])
  })

  it('is empty without posts', () => {
    expect(featuredPosts([], next, last, NOW)).toEqual([])
  })
})

describe('homePosts', () => {
  it('drops posts whose expires_on is before today; today and unset stay, in order', () => {
    const posts = [
      post(1, { expires_on: '2026-10-26' }),
      post(2, { expires_on: '2026-10-27' }),
      post(3, { expires_on: '2026-10-28' }),
      post(4, { expires_on: null }),
      post(5),
    ]
    expect(homePosts(posts, NOW).map((p) => p.id)).toEqual([2, 3, 4, 5])
  })

  it('drops core posts: they are page sections, not feed items', () => {
    const posts = [post(1, { is_core: true }), post(2), post(3, { is_core: false })]
    expect(homePosts(posts, NOW).map((p) => p.id)).toEqual([2, 3])
    expect(feedPosts(posts).map((p) => p.id)).toEqual([2, 3])
  })
})
