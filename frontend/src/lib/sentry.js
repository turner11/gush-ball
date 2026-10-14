// verify-email tokens are signed, not encrypted, so query strings must never reach Sentry.
const noQuery = (url) => url.replace(/\?[^#]*/, '')

export function stripQueryStrings(event) {
  if (event.request?.url) event.request.url = noQuery(event.request.url)
  for (const { data } of event.breadcrumbs ?? []) {
    for (const key of ['from', 'to', 'url']) if (typeof data?.[key] === 'string') data[key] = noQuery(data[key])
  }
  return event
}
