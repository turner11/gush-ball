// The youtube-nocookie embed URL for a YouTube link (watch, youtu.be, shorts, embed), or null for any other URL.
export function youtubeEmbedUrl(url) {
  try {
    const u = new URL(url)
    let id = null
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1)
    else if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else id = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
    }
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  } catch {
    return null // not a URL: a plain link
  }
}
