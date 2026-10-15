import { captureException, init } from '@sentry/vue'

let markReady
const ready = new Promise((resolve) => (markReady = resolve))

// Named imports so only init/captureException are bundled. No tracing/replay. Props can hold emails
// (admin member lists), so they are not attached.
export function initSentry(app) {
  init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    attachProps: false,
    beforeSend: stripQueryStrings,
  })
  markReady()
}

// Waits for init: captureException before init has no client and is silently dropped, and a first-render
// crash can get here before main.js's lazy init chain runs.
export const report = (err) => ready.then(() => captureException(err))

// verify-email tokens are signed, not encrypted, so query strings must never reach Sentry.
const noQuery = (url) => url.replace(/\?[^#]*/, '')

export function stripQueryStrings(event) {
  if (event.request?.url) event.request.url = noQuery(event.request.url)
  for (const { data } of event.breadcrumbs ?? []) {
    for (const key of ['from', 'to', 'url']) if (typeof data?.[key] === 'string') data[key] = noQuery(data[key])
  }
  return event
}
