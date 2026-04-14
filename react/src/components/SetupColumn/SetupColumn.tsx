import { useCallback, useState, type ReactNode } from 'react'
import type { TrackedHeader } from '../../lib/selectedHeadersStorage'
import './SetupColumn.css'

export type { TrackedHeader }

export type SetupColumnProps = {
  /** Sidebar: "Select what column headers to be tracked:" */
  description?: string
  /** When true, shows the same loading UI as loadingComponent() before getValues resolves. */
  loading?: boolean
  /** Shown when fetch fails (sidebar: setStatus). */
  error?: string | null
  /** First row from the sheet (sidebar: result[0]); empty cells become no button. */
  headers: string[]
  /** Controlled selection (recommended when persisting from parent). */
  selected?: TrackedHeader[]
  /** Uncontrolled initial selection when `selected` is omitted. */
  initialSelected?: TrackedHeader[]
  onSelectionChange?: (selected: TrackedHeader[]) => void
  /** Sidebar: mainUI() on Proceed. */
  onProceed?: () => void
}

function isSelected(
  selected: TrackedHeader[],
  header: string,
  index: string
): boolean {
  return selected.some((h) => h.header === header && h.index === index)
}

export function SetupColumn({
  description = 'Select what column headers to be tracked:',
  loading = false,
  error = null,
  headers,
  selected: selectedProp,
  initialSelected = [],
  onSelectionChange,
  onProceed,
}: SetupColumnProps) {
  const [internalSelected, setInternalSelected] = useState<TrackedHeader[]>(initialSelected)
  const isControlled = selectedProp !== undefined
  const selected = isControlled ? selectedProp : internalSelected

  const toggleHeader = useCallback(
    (header: string, index: string) => {
      const prev = selected
      const at = prev.findIndex((h) => h.header === header && h.index === index)
      const next =
        at >= 0 ? [...prev.slice(0, at), ...prev.slice(at + 1)] : [...prev, { header, index }]
      if (!isControlled) setInternalSelected(next)
      onSelectionChange?.(next)
    },
    [isControlled, onSelectionChange, selected]
  )

  let body: ReactNode
  if (loading) {
    body = (
      <div
        className="setup-loading"
        role="status"
        aria-live="polite"
        aria-label="Loading setup UI"
      >
        <div className="spinner" aria-hidden="true" />
        <span className="setup-loading-text">Loading...</span>
      </div>
    )
  } else if (error) {
    body = (
      <p className="setup-column-error" role="alert">
        {error}
      </p>
    )
  } else {
    body = (
      <div id="setup-subcontent" className="setup-subcontent">
        <div className="header-list">
          {headers.map((header, idx) => {
            if (header.trim() === '') return null
            const index = String(idx + 1)
            const sel = isSelected(selected, header, index)
            return (
              <button
                key={index}
                type="button"
                className={`select-btn header-btn${sel ? ' is-selected' : ''}`}
                data-header={header}
                data-index={index}
                onClick={() => toggleHeader(header, index)}
              >
                {header}
              </button>
            )
          })}
        </div>
        <div className="setup-footer">
          <button
            id="proceed-btn"
            type="button"
            onClick={() => onProceed?.()}
          >
            Proceed
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-column">
      <label id="setup-desc" className="setup-column-desc">
        {description}
      </label>
      <div id="setup-content" className="setup-content">
        {body}
      </div>
    </div>
  )
}

export default SetupColumn
