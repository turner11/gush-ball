import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders bold, lists and single-newline breaks', () => {
    const el = document.createElement('div')
    el.innerHTML = renderMarkdown('**א**\n\n- א\n- ב\n\nא\nב')
    expect(el.querySelector('strong').textContent).toBe('א')
    expect(el.querySelectorAll('ul li')).toHaveLength(2)
    expect(el.querySelector('br')).not.toBeNull()
  })

  it('strips scripts, event handlers and javascript: links', () => {
    const html = renderMarkdown('<script>x</script><img src=x onerror=alert(1)>[c](javascript:alert(1))')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})
