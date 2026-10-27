export const DEFAULT_PLAYER_PHOTO = '/default-player.png'

// Backend-detected face focus (CSS %) + zoom, for the circle and the hover slide; without it the photo stays top-anchored.
export function focusStyle(img) {
  if (img?.focus_x == null) return undefined
  const at = `${img.focus_x}% ${img.focus_y}%`
  return { objectPosition: at, transformOrigin: at, transform: `scale(${img.zoom})` }
}

// Round-avatar props: the backend's pre-framed, downsampled copy (#568) needs no focus transform; without one, the original + focus.
export function avatarImg(img) {
  return {
    src: img?.avatar_url || img?.url || DEFAULT_PLAYER_PHOTO,
    style: img?.avatar_url ? undefined : focusStyle(img),
  }
}

// Dead/blocked hotlink -> default; the endsWith guard stops a loop if the default itself fails.
export function onPlayerImgError(e) {
  if (!e.target.src.endsWith(DEFAULT_PLAYER_PHOTO)) e.target.src = DEFAULT_PLAYER_PHOTO
}
