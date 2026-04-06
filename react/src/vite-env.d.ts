/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full WebSocket URL, e.g. wss://host/ws/generate-spec */
  readonly VITE_WS_SPEC_URL?: string
  /** HTTPS (or HTTP) backend base; client derives wss URL like Code.gs */
  readonly VITE_BACKEND_BASE_URL?: string
  /** Used for local dev when Apps Script template vars aren't present */
  readonly VITE_SHEET_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
