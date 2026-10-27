import { mount, RouterLinkStub } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AboutView from './AboutView.vue'

const mountView = () => mount(AboutView, { global: { stubs: { RouterLink: RouterLinkStub } } })

describe('AboutView', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows a mailto link to VITE_CONTACT_EMAIL', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', 'about@example.com')
    const w = mountView()

    expect(w.find('a[href="mailto:about@example.com"]').exists()).toBe(true)
    expect(w.findAll('h1').map((h) => h.text())).toEqual(['אודות'])
    expect(w.findAll('h2').length).toBeGreaterThanOrEqual(3)
    expect(document.title).toContain('אודות')
    const targets = w.findAllComponents(RouterLinkStub).map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'join' })
    expect(targets).toContainEqual({ name: 'teams' })
    expect(w.text()).toContain('GushBall')
    expect(w.text()).not.toContain('גוש כדורסל')
  })

  it('shows the fallback and no mailto when VITE_CONTACT_EMAIL is unset', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', '')
    const w = mountView()

    expect(w.find('a[href^="mailto:"]').exists()).toBe(false)
    expect(w.text()).toContain('כתובת ליצירת קשר תפורסם כאן בקרוב')
  })

  it("removes a team page's leftover JSON-LD", () => {
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.setAttribute('data-page', '')
    document.head.appendChild(ld)
    mountView()

    expect(document.head.querySelector('script[data-page]')).toBeNull()
  })
})
