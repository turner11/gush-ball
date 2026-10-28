import DOMPurify from 'dompurify'
import { marked } from 'marked'

// Post markdown -> sanitized HTML; the only place marked/DOMPurify are called, since callers use v-html.
// breaks: true keeps old plain-text posts looking the same (newline -> <br>).
// ponytail: `#` headings render as real h1-h6 inside the card; demote via a marked renderer if an a11y audit flags it.
export const renderMarkdown = (text) =>
  DOMPurify.sanitize(marked.parse(text ?? '', { gfm: true, breaks: true, async: false }))
