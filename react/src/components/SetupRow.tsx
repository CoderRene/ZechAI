import './SetupRow.css'

/** Mirrors appscript Sidebar.html setupRowSelectionComponent (row header buttons). */

export type SetupRowProps = {
  rows: number[]
  /** Called when a row button is clicked (sidebar: setupColumnSelectionComponent). */
  onSelectRow?: (row: number) => void
}

export function SetupRow({ rows, onSelectRow }: SetupRowProps) {
  return (
    <div className="setup-content" id="setup-content">
      {rows.map((row) => (
        <button
          key={row}
          type="button"
          id={`row-${row}`}
          className="setup-row-btn"
          onClick={() => onSelectRow?.(row)}
        >
          Row {row}
        </button>
      ))}
    </div>
  )
}

export default SetupRow
