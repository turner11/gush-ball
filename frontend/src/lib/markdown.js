import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Post markdown -> sanitized HTML; the only place marked/DOMPurify are called, since callers use v-html.
// breaks: true keeps old plain-text posts looking the same (newline -> <br>).
// ponytail: `#` headings render as real h1-h6 inside the card; demote via a marked renderer if an a11y audit flags it.
// Allowlist of what Markdown produces: no style, form, input, or button, so admin content can't phish.
// The only style that can appear is built by the hook below from a digits-only img height; author `style` stays dropped.
// The hook is global to DOMPurify, so any future caller inherits it (harmless: it only touches IMG).
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td']
const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'start', 'align', 'width', 'height']
// ponytail: height attr → max-height (preflight's height:auto beats the attr); swap for CSS attr() once it's cross-browser
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const height = node.tagName === 'IMG' && node.getAttribute('height')
  if (height && /^\d+$/.test(height)) node.style.maxHeight = `${height}px`
})
export const renderMarkdown = (text) =>
  DOMPurify.sanitize(marked.parse(text ?? '', { gfm: true, breaks: true, async: false }), { ALLOWED_TAGS, ALLOWED_ATTR })
