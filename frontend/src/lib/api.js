// The one place that knows the `/api` prefix, `credentials: 'include'` and JSON handling.
// Throws on a non-2xx response with the server's `detail` as message and `status` attached.
export async function apiFetch(path, options = {}) {
  const { body, headers, ...rest } = options
  const isPlainBody = body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)

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
    const error = new Error(detail)
    error.status = res.status
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

// For composables that expose an `error` ref instead of throwing: on failure, sets
// `errorRef` to the user-facing `message` and resolves to undefined.
export async function tryApiFetch(errorRef, message, path, options) {
  try {
    return await apiFetch(path, options)
  } catch {
    errorRef.value = message
  }
}
