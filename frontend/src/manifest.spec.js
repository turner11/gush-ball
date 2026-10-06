import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel) => readFileSync(resolve(rel)) // ponytail: relative to cwd (frontend/), where CI runs vitest

describe('web app manifest', () => {
  it('index.html links the manifest', () => {
    expect(read('index.html').toString()).toMatch(/rel="manifest"\s+href="\/manifest\.json"/)
  })

  it('meets Chrome install criteria', () => {
    const m = JSON.parse(read('public/manifest.json').toString())
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    expect(m.start_url).toBe('/')
    expect(['standalone', 'minimal-ui', 'fullscreen']).toContain(m.display)
    for (const size of ['192x192', '512x512']) {
      expect(m.icons).toContainEqual(expect.objectContaining({ sizes: size, type: 'image/png' }))
    }
  })

  it('icons exist at their declared size', () => {
    const m = JSON.parse(read('public/manifest.json').toString())
    for (const { src, sizes } of m.icons) {
      const png = read(`public${src}`)
      expect(png.subarray(1, 4).toString(), src).toBe('PNG')
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, src).toBe(sizes)
    }
  })
})
