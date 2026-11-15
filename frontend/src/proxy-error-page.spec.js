import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

// The page is pasted by hand into Coolify's proxy fallback (DEPLOYMENT.md §11), so it must stand alone.
const html = readFileSync(resolve(__dirname, '..', 'proxy-error.html'), 'utf8')

const load = (url) => new JSDOM(html, { url, runScripts: 'dangerously' }).window.document

describe('proxy-error.html', () => {
  it('is a self-contained Hebrew RTL page Coolify accepts', () => {
    expect(Buffer.byteLength(html)).toBeLessThan(1048576)
    for (const needle of ['lang="he"', 'dir="rtl"', 'prefers-color-scheme: dark', 'http-equiv="refresh"', 'GushBall', 'נסו שוב']) {
      expect(html).toContain(needle)
    }
    expect(html).not.toContain('גוש כדורסל')
    expect(html).not.toContain('נסה שוב')
    expect(html).not.toMatch(/src="http|href="http|url\(http|@import|<link rel="stylesheet"/)
  })

  it('shows the GushBall page on the GushBall host', () => {
    const doc = load('https://www.gushball.example/team/x')
    expect(doc.getElementById('gushball').hidden).toBe(false)
    expect(doc.getElementById('generic').hidden).toBe(true)
    expect(doc.title).toContain('GushBall')
  })

  it('shows the neutral page on any other host (the proxy is shared)', () => {
    const doc = load('https://other-site.example/')
    expect(doc.getElementById('generic').hidden).toBe(false)
    expect(doc.getElementById('gushball').hidden).toBe(true)
    expect(doc.title).not.toContain('GushBall')
  })
})
