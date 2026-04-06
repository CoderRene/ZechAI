/**
 * google.script.run bridge + dev mocks when the host is not Google Sheets.
 */

export type Selection1Based = { r1: number; c1: number; r2: number; c2: number }

export type ActiveSelection = {
  a1: string
  _1Based: Selection1Based
  values: unknown[][]
  sheetName: string
}

function run(): GoogleScriptRun {
  const g = typeof window !== 'undefined' ? window.google?.script?.run : undefined
  if (!g) {
    throw new Error('google.script.run is not available')
  }
  return g as GoogleScriptRun
}

export function isGasAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.google?.script?.run
}

const MOCK_SHEET = 'Mock Sheet'

function mockGetRows(): number[] {
  return [1, 2, 3, 4, 5]
}

function mockGetValues(_range: string): string[][] {
  return [['Req ID', 'Title', 'Technical spec', 'Notes']]
}

function mockGetActiveSheetName(): string {
  return (document.body?.dataset?.sheetName || '').trim() || MOCK_SHEET
}

function mockGetActiveSelection(): ActiveSelection {
  return {
    a1: 'B2:D5',
    _1Based: { r1: 2, c1: 2, r2: 5, c2: 4 },
    values: [],
    sheetName: mockGetActiveSheetName(),
  }
}

export async function gasGetActiveSheet(): Promise<string> {
  if (!isGasAvailable()) return mockGetActiveSheetName()
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler(reject).getActiveSheetName()
  })
}

export async function gasGetRows(): Promise<number[]> {
  if (!isGasAvailable()) return mockGetRows()
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler(reject).getRows()
  })
}

export async function gasGetValues(range: string): Promise<string[][]> {
  if (!isGasAvailable()) return mockGetValues(range)
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler(reject).getValues(range)
  })
}

export async function gasGetActiveSheetName(): Promise<string> {
  if (!isGasAvailable()) return mockGetActiveSheetName()
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler(reject).getActiveSheetName()
  })
}

export async function gasGetActiveSelection(): Promise<ActiveSelection | null> {
  if (!isGasAvailable()) return mockGetActiveSelection()
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(resolve).withFailureHandler(reject).getActiveSelection()
  })
}

/** Single cell read — uses 1-based row/col corners (matches Sheet range semantics). */
export async function gasReadCell(row: number, col: number): Promise<string> {
  const c = typeof col === 'string' ? Number(col) : col
  if (!isGasAvailable()) {
    return `mock R${row}C${c}`
  }
  return new Promise((resolve, reject) => {
    run()
      .withSuccessHandler((values: unknown) => {
        const grid = values as unknown[][]
        const v = grid?.[0]?.[0]
        resolve(v == null ? '' : String(v))
      })
      .withFailureHandler(reject)
      .readByIndices(row, c, row, c)
  })
}

export async function gasWriteCell(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  value: string
): Promise<void> {
  if (!isGasAvailable()) {
    return
  }
  return new Promise((resolve, reject) => {
    run().withSuccessHandler(() => resolve()).withFailureHandler(reject).writeCell(r1, c1, r2, c2, value)
  })
}

export function gasShowSidebar(): void {
  try {
    if (isGasAvailable()) {
      run().showSidebar()
    }
  } catch {
    // ignore
  }
}

/** Minimal typing for google.script.run chaining */
type GoogleScriptRun = {
  // `google.script.run` can return different shapes depending on the invoked method.
  // Keep this typing flexible to avoid TS callback parameter mismatches.
  withSuccessHandler: (fn: (x: any) => void) => GoogleScriptRun
  withFailureHandler: (fn: (err: Error) => void) => GoogleScriptRun
  getRows: () => void
  getValues: (range: string) => void
  getActiveSheetName: () => void
  getActiveSelection: () => void
  readByIndices: (r1: number, c1: number, r2: number, c2: number) => void
  writeCell: (r1: number, c1: number, r2: number, c2: number, value: string) => void
  showSidebar: () => void
}

declare global {
  interface Window {
    google?: { script: { run: GoogleScriptRun } }
  }
}
