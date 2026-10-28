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
    const html = renderMarkdown('<script>x</script><img src=x onerror=alert(1)>' + String.fromCharCode(10, 10) + '[c](javascript:alert(1))')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })

  it('strips style attributes and form controls (no phishing overlays)', () => {
    const html = renderMarkdown('<div style="position:fixed;inset:0">x</div><form action="https://evil.example"><input name=password><button>go</button></form>')
    for (const bad of ['style', '<form', '<input', '<button', 'evil.example']) expect(html).not.toContain(bad)
  })
})
