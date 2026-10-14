import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { initSentry, report, stripQueryStrings } from './sentry'

const calls = vi.hoisted(() => [])
vi.mock('@sentry/vue', () => ({
  init: () => calls.push('init'),
  captureException: (err) => calls.push(err.message),
}))

describe('report', () => {
  it('holds an error raised before init and sends it after init', async () => {
    // a first-render crash reaches ErrorBoundary before main.js's lazy init chain has run
    report(new Error('boom'))
    await flushPromises()
    expect(calls).toEqual([])

    initSentry({})
    await flushPromises()
    expect(calls).toEqual(['init', 'boom'])
  })
})

describe('stripQueryStrings', () => {
  it('drops ?token from request.url and navigation breadcrumbs', () => {
    const event = {
      request: { url: 'https://x.il/admin/verify-email?token=abc#h' },
      breadcrumbs: [
        { category: 'navigation', data: { from: '/admin/verify-email?token=abc', to: '/admin' } },
        { category: 'ui.click', message: 'a' },
      ],
    }
    const out = stripQueryStrings(event)
    expect(out.request.url).toBe('https://x.il/admin/verify-email#h')
    expect(out.breadcrumbs[0].data).toEqual({ from: '/admin/verify-email', to: '/admin' })
    expect(out.breadcrumbs[1]).toEqual({ category: 'ui.click', message: 'a' })
  })

  it('tolerates events without a request or breadcrumbs', () => {
    expect(stripQueryStrings({})).toEqual({})
  })
})
