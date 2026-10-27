const MAX_FEATURED = 3
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

// Posts still live on the home page: expires_on (YYYY-MM-DD, inclusive, viewer's local day) unset or not yet past (#569).
// The posts page and the admin editor keep listing expired posts.
export const homePosts = (posts, now = new Date()) => {
  const today = now.toLocaleDateString('en-CA')
  return posts.filter((p) => !p.expires_on || p.expires_on >= today)
}

// Posts for the home hero: next-game posts, then last-game posts, then posts from the last 14 days, each tier in API
// order and deduped. When nothing matches, the first post (API order: pinned, then newest) so the hero is never empty.
export function featuredPosts(posts, nextGame, lastGame, now = new Date()) {
  const forGame = (game, label) =>
    game ? posts.filter((p) => p.game_id === game.id).map((post) => ({ post, label: `${label} ${game.opponent.name}` })) : []
  const recent = posts
    .filter((p) => p.created_at && now - new Date(p.created_at) <= RECENT_MS)
    .map((post) => ({ post, label: null }))
  const tiers = [...forGame(nextGame, 'לקראת המשחק נגד'), ...forGame(lastGame, 'מהמשחק נגד'), ...recent]
  const seen = new Set()
  const out = tiers.filter(({ post }) => !seen.has(post.id) && seen.add(post.id)).slice(0, MAX_FEATURED)
  return out.length || !posts.length ? out : [{ post: posts[0], label: null }]
}
