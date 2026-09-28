// Formalizes the `credentials: 'include'` + JSON fetch pattern useAuth.js already
// hand-rolls, so the ~12 admin CRUD call sites don't each repeat it.
export async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options
  const isPlainBody = body !== undefined && body !== null && typeof body === 'object'

  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...rest,
    headers: isPlainBody ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: isPlainBody ? JSON.stringify(body) : body,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (data?.detail) detail = data.detail
    } catch {
      // non-JSON error body — fall back to statusText
    }
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}
