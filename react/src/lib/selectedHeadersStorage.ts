export type TrackedHeader = { header: string; index: string }

export function selectedHeadersStorageKey(wsUrl: string, sheetName: string): string {
  const wsUrlForKey = (wsUrl || '').trim()
  const sheetForKey = sheetName
  return `rtm_selectedHeaders_v2:${encodeURIComponent(wsUrlForKey)}:${encodeURIComponent(sheetForKey)}`
}

export function normalizeSelectedHeaders(parsedArray: unknown): TrackedHeader[] {
  if (!Array.isArray(parsedArray)) return []
  return parsedArray
    .map((h) => {
      if (!h || typeof h !== 'object') return { header: '', index: '' }
      const o = h as { header?: unknown; index?: unknown }
      return {
        header: String(o.header ?? '').trim(),
        index: String(o.index ?? '').trim(),
      }
    })
    .filter((h) => h.header !== '' && h.index !== '')
}

export function safeLoadSelectedHeaders(key: string): TrackedHeader[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { headers?: unknown }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.headers)) {
      return normalizeSelectedHeaders(parsed.headers)
    }
    return []
  } catch {
    return []
  }
}

export function safePersistSelectedHeaders(
  key: string,
  sheetName: string,
  headers: TrackedHeader[]
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ sheetName, headers }))
  } catch {
    // localStorage may be blocked
  }
}
