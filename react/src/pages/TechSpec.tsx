import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConnectionStatus from '../components/ConnectionStatus/ConnectionStatus'
import EnhanceText from '../components/EnhanceText/EnhanceText'
import Loading from '../components/Loading/Loading'
import SetupColumn from '../components/SetupColumn/SetupColumn'
import SetupRow from '../components/SetupRow/SetupRow'
import { resolveWsSpecUrl } from '../lib/clientEnv'
import {
	gasGetActiveSelection,
	gasGetRows,
	gasGetValues,
	gasReadCell,
	gasShowSidebar,
	gasWriteCell
} from '../lib/gas'
import {
	safeLoadSelectedHeaders,
	safePersistSelectedHeaders,
	selectedHeadersStorageKey,
	type TrackedHeader,
} from '../lib/selectedHeadersStorage'
import { newSessionId } from '../lib/session'
import { useSpecSocket } from '../lib/useSpecSocket'
import { isSheetSwitch } from '../utils/util'
import './main.css'

const USER_ID = 'api-user'
const DEFAULT_ENHANCE_TXT = 'Click "Enhance" to enhance the selected technical specifications'

export default function Home() {
	const wsUrl = resolveWsSpecUrl()
	const sheetName = (document.body?.dataset?.sheetName ?? '').trim()
	const storageKey = useMemo(() => selectedHeadersStorageKey(wsUrl, sheetName), [wsUrl, sheetName])

	const scrollRef = useRef<HTMLDivElement>(null)
	const additionalDetailsRef = useRef<HTMLTextAreaElement>(null)
	const { status: socketStatus, setStatusMessage, sendGenerateSpecOverSocket } = useSpecSocket(wsUrl)

	const [phase, setPhase] = useState<'loading' | 'row' | 'column' | 'main'>('loading')
	const [sheetRows, setSheetRows] = useState<number[]>([])
	const [columnLoading, setColumnLoading] = useState(false)
	const [columnError, setColumnError] = useState<string | null>(null)
	const [columnHeaders, setColumnHeaders] = useState<string[] | null>(null)

	const [selectedHeaders, setSelectedHeaders] = useState<TrackedHeader[]>(() =>
		safeLoadSelectedHeaders(selectedHeadersStorageKey(wsUrl, sheetName))
	)

	const [settingsOpen, setSettingsOpen] = useState(false)
	const [sheetSwitchBlock, setSheetSwitchBlock] = useState(false)

	const [enhanceTxt, setEnhanceTxt] = useState(DEFAULT_ENHANCE_TXT)
	const [enhanceProgress, setEnhanceProgress] = useState('')
	const [enhanceBusy, setEnhanceBusy] = useState(false)
	const [blurHidden, setBlurHidden] = useState(true)

	const [additionalDetails, setAdditionalDetails] = useState('')

	useEffect(() => {
		// Auto-resize the textarea based on content height.
		const el = additionalDetailsRef.current
		if (!el) return

		el.style.height = 'auto'
		el.style.height = `${el.scrollHeight}px`
	}, [additionalDetails])

	const persistHeaders = useCallback(
		(headers: TrackedHeader[]) => {
			safePersistSelectedHeaders(storageKey, sheetName, headers)
		},
		[storageKey, sheetName]
	)

	const loadMainEntry = useCallback(async () => {
		setPhase('loading')
		try {
			const rows = await gasGetRows()
			setSheetRows(rows)
			const loaded = safeLoadSelectedHeaders(storageKey)
			setSelectedHeaders(loaded)
			if (loaded.length > 0) {
				setPhase('main')
			} else {
				setPhase('row')
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setStatusMessage(msg, 'error')
			setPhase('row')
		}
	}, [storageKey, setStatusMessage])

	useEffect(() => {
		void loadMainEntry()
	}, [loadMainEntry])

	const handleSelectRow = useCallback(
		async (row: number) => {
			setPhase('column')
			setColumnLoading(true)
			setColumnError(null)
			setColumnHeaders(null)
			try {
				const result = await gasGetValues(`${row}:${row}`)
				setColumnHeaders(result[0] ?? [])
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				setColumnError(msg)
				setStatusMessage(msg, 'error')
			} finally {
				setColumnLoading(false)
			}
		},
		[setStatusMessage]
	)

	const handleSelectionChange = useCallback(
		(next: TrackedHeader[]) => {
			setSelectedHeaders(next)
			persistHeaders(next)
		},
		[persistHeaders]
	)

	const handleProceed = useCallback(() => {
		setPhase('main')
	}, [])

	const handleResetHeaders = useCallback(() => {
		setSelectedHeaders([])
		persistHeaders([])
		setSettingsOpen(false)
		setSheetSwitchBlock(false)
		void loadMainEntry()
	}, [persistHeaders, loadMainEntry])

	const handleEnhance = useCallback(async () => {
		setStatusMessage('Connected', 'connected')
		setEnhanceBusy(true)
		setEnhanceTxt('Validating sheet...')
		setEnhanceProgress('')

		let hasError = false

		try {
			const switched = await isSheetSwitch(sheetName)
			if (switched) {
				setSheetSwitchBlock(true)
				setEnhanceBusy(false)
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
				gasShowSidebar()
				return
			}

			setEnhanceTxt('Reading selected cell...')

			const activeSelection = await gasGetActiveSelection()
			if (!activeSelection) {
				setEnhanceTxt('No active selection.')
				setEnhanceBusy(false)
				setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
				return
			}

			const _1Based = activeSelection._1Based
			const selectedColIndexes: string[] = []
			for (let col = _1Based.c1; col <= _1Based.c2; col++) {
				selectedColIndexes.push(String(col))
			}

			const trackedColInSelection = selectedHeaders.filter((h) =>
				selectedColIndexes.includes(h.index)
			)

			if (trackedColInSelection.length === 0) {
				setStatusMessage(
					'Warning: No tracked headers are within your current selection.',
					'warning'
				)
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
				setEnhanceBusy(false)
				return
			}

			if (trackedColInSelection.length > 1) {
				setStatusMessage('Oops! we can only enhance one column at a time.', 'warning')
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
				setEnhanceBusy(false)
				return
			}

			const rows: number[] = []
			for (let row = _1Based.r1; row <= _1Based.r2; row++) {
				rows.push(row)
			}

			const readCell = (row: number, col: string) => gasReadCell(row, Number(col))
			const writeCell = async (row: number, col: number, value: string) => await gasWriteCell(row, col, 1, 1, value)

			const tickets = await Promise.all(
				rows.map((row) =>
					Promise.all(
						selectedHeaders.map((h) =>
							readCell(row, h.index).then((value) => `${h.header}: \n${value}`)
						)
					).then((parts) => parts.join('\n'))
				)
			)

			setEnhanceTxt('Processing prompt...')
			for (let i = 0; i < tickets.length; i++) {
				const row = rows[i]
				var ticket = tickets[i]

				if (additionalDetails.trim() !== '') // only add additional details if it's not empty
					ticket += `\n\nAdditional Details: ${additionalDetails}`

				setEnhanceProgress(`Enhancing ${i + 1} of ${tickets.length}...`)
				setBlurHidden(true)

				const result = await sendGenerateSpecOverSocket('techspec', ticket, USER_ID, newSessionId(), {
					onChunk: (text) => {
						setEnhanceTxt(text)
						const el = scrollRef.current
						if (el) el.scrollTop = el.scrollHeight
					},
					onFirstStreamChunk: () => setBlurHidden(false),
				})

				setBlurHidden(true)
				setEnhanceTxt('Preparing to write to the cell...')
				await writeCell(row, _1Based.c1, result)
				setEnhanceTxt(`Enhanced ${i + 1} ticket out of ${rows.length}...`)
			}
		} catch (err) {
			hasError = true
			const msg = err instanceof Error ? err.message : String(err)
			setEnhanceTxt(msg)
			setTimeout(() => setEnhanceTxt(DEFAULT_ENHANCE_TXT), 2000)
		} finally {
			setEnhanceBusy(false)
			setEnhanceProgress('')
			if (!hasError)
				setEnhanceTxt(DEFAULT_ENHANCE_TXT)
		}
	}, [
		sheetName,
		selectedHeaders,
		additionalDetails,
		sendGenerateSpecOverSocket,
		setStatusMessage,
	])

	return (
		<div className="home">
			<ConnectionStatus
				status={socketStatus.variant}
				message={socketStatus.message}
			/>

			{/* SETUP UI SECTION */}
			{phase !== 'main' && (
				<div id="setup-sect">
					{phase === 'loading' && (
						<Loading />
					)}

					{/* when the user is selecting a row to be a header */}
					{phase === 'row' && (
						<>
							<label className="setup-row-phase-desc" id="setup-desc">
								Select a row to be a header:
							</label>
							<SetupRow rows={sheetRows} onSelectRow={handleSelectRow} />
						</>
					)}

					{/* when the user is selecting a column header to be tracked */}
					{phase === 'column' && (
						<SetupColumn
							loading={columnLoading}
							error={columnError}
							headers={columnHeaders ?? []}
							selected={selectedHeaders}
							onSelectionChange={handleSelectionChange}
							onProceed={handleProceed}
						/>
					)}
				</div>
			)}

			{/* MAIN UI SECTION */}
			<div id="content-sect" className={phase === 'main' ? '' : 'disable'}>
				{phase === 'main' && !sheetSwitchBlock && (
					<div>
						<div id="settings-btn-root">
							<button
								type="button"
								id="settings-btn"
								aria-expanded={settingsOpen}
								onClick={() => setSettingsOpen((o) => !o)}
							>
								⚙
							</button>
						</div>

						{settingsOpen && (
							<div id="settings-content">
								<div className="tracked-row">
									<label>Tracked headers:</label>
									{selectedHeaders.length > 0 ? (
										selectedHeaders.map((h) => (
											<span key={`${h.index}-${h.header}`} id={`h-tracked-${h.index}`} className="chip">
												{h.header}
											</span>
										))
									) : (
										<span className="muted-note">None selected</span>
									)}
								</div>
								<div className="settings-reset-row">
									<div
										id="reset-headers-btn"
										className="secondary-btn"
										role="button"
										tabIndex={0}
										onClick={handleResetHeaders}
										onKeyDown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault()
												handleResetHeaders()
											}
										}}
									>
										Reset headers
									</div>
								</div>
							</div>
						)}

						<label id="enhance-progress">{enhanceProgress}</label>
						<EnhanceText
							scrollRef={scrollRef}
							blurHidden={blurHidden}
							enhanceText={enhanceTxt}
						/>

						<div id="addtnl-details-container">
							<textarea
								id="addtnl-details-textarea"
								placeholder='(Optional) Add more details...'
								value={additionalDetails}
								disabled={enhanceBusy}
								ref={additionalDetailsRef}
								onChange={(e) => setAdditionalDetails(e.target.value)}
							/>
						</div>

						<button
							id="enhance-btn"
							className={`btn-block${enhanceBusy ? ' is-loading' : ''}`}
							type="button"
							disabled={enhanceBusy}
							onClick={() => void handleEnhance()}
						>
							Enhance ✦
						</button>
					</div>
				)}

				{phase === 'main' && sheetSwitchBlock && (
					<p className="sheet-switch-msg">
						Oops! we can&apos;t enhance the selected cells because you have switched to a different sheet.
					</p>
				)}
			</div>
		</div>
	)
}
