// Team.background is either a bundled preset key or an image URL (upload or external).
export const BACKGROUND_PRESETS = [
  { value: 'hoop-1', label: 'רקע 1' },
  { value: 'hoop-2', label: 'רקע 2' },
]

export const isPresetBackground = (value) => BACKGROUND_PRESETS.some((p) => p.value === value)

export function backgroundSrc(value) {
  if (!value) return '/backgrounds/hoop-1.jpg'
  return isPresetBackground(value) ? `/backgrounds/${value}.jpg` : value
}
