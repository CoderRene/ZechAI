export function resolveWsSpecUrl(): string {
  const envWs = (import.meta.env.VITE_WS_SPEC_URL ?? '').trim()
  return envWs
}
