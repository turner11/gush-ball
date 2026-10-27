import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AccessibilityView from './AccessibilityView.vue'

describe('AccessibilityView', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows a mailto link to VITE_CONTACT_EMAIL', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', 'a11y@example.com')
    const w = mount(AccessibilityView)

    expect(w.find('a[href="mailto:a11y@example.com"]').exists()).toBe(true)
    expect(w.findAll('h1').map((h) => h.text())).toEqual(['הצהרת נגישות'])
    expect(w.findAll('h2').length).toBeGreaterThan(2)
    expect(w.find('time[datetime]').exists()).toBe(true)
    expect(document.title).toContain('הצהרת נגישות')
  })

  it('shows the fallback and no mailto when VITE_CONTACT_EMAIL is unset', () => {
    vi.stubEnv('VITE_CONTACT_EMAIL', '')
    const w = mount(AccessibilityView)

    expect(w.find('a[href^="mailto:"]').exists()).toBe(false)
    expect(w.text()).toContain('כתובת לפניות בנושא נגישות תפורסם כאן בקרוב')
  })

  it("removes a team page's leftover JSON-LD", () => {
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.setAttribute('data-page', '')
    document.head.appendChild(ld)
    mount(AccessibilityView)

    expect(document.head.querySelector('script[data-page]')).toBeNull()
  })
})
