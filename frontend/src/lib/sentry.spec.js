import { describe, expect, it } from 'vitest'

import { stripQueryStrings } from './sentry'

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
